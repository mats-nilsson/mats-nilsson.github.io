/**
 * WebRTC & WebCodecs Capability Analyzer - Codec Utilities
 * Defines profiles, scalability modes, MIME types, and SDP manipulators.
 */

export const CODECS = {
    H265: {
        name: 'H.265 / HEVC',
        webcodecsMime: 'video/hevc',
        webcodecsProfile: 'hev1.1.6.L93.B0', // Main profile, Main tier, Level 3.1
        webrtcCodecName: 'H265',
        sdpMatch: /h265/i
    },
    VP9: {
        name: 'VP9',
        webcodecsMime: 'video/vp9',
        webcodecsProfile: 'vp09.00.10.08', // Profile 0, level 1.0, bit depth 8
        webrtcCodecName: 'VP9',
        sdpMatch: /vp9/i
    },
    AV1: {
        name: 'AV1',
        webcodecsMime: 'video/av1',
        webcodecsProfile: 'av01.0.04M.08', // Main profile, Level 3.0, 8-bit
        webrtcCodecName: 'AV1',
        sdpMatch: /av1/i
    },
    H264: {
        name: 'H.264',
        webcodecsMime: 'video/avc',
        webcodecsProfile: 'avc1.42001f', // Constrained Baseline Profile, Level 3.1
        webrtcCodecName: 'H264',
        sdpMatch: /h264/i
    },
    VP8: {
        name: 'VP8',
        webcodecsMime: 'vp8',
        webcodecsProfile: '',
        webrtcCodecName: 'VP8',
        sdpMatch: /vp8/i
    }
};

export const SCALABILITY_MODES = [
    'L1T1',
    'L1T2',
    'L1T3',
    'L2T1',
    'L2T2',
    'L2T3',
    'L3T1',
    'L3T2',
    'L3T3'
];

export const RESOLUTIONS = {
    '1080p': { width: 1920, height: 1080, bitrate: 4000000 },
    '720p':  { width: 1280, height: 720,  bitrate: 2000000 },
    '360p':  { width: 640,  height: 360,  bitrate: 800000 },
    '180p':  { width: 320,  height: 180,  bitrate: 200000 }
};

/**
 * Formats standard WebCodecs codec string based on configurations
 */
export function getWebCodecsCodecString(codecKey) {
    const spec = CODECS[codecKey];
    if (!spec) return null;
    // WebCodecs VideoEncoder config expects the raw RFC registry profile string directly
    // (e.g. "vp8", "vp09.00.10.08", "avc1.42001f") without the container wrapper (e.g. "video/avc;codecs=...")
    return spec.webcodecsProfile ? spec.webcodecsProfile : spec.webcodecsMime;
}

/**
 * Verifies WebCodecs codec/configuration support statically
 */
export async function checkWebCodecsStaticSupport(codecKey, config) {
    if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) {
        return { supported: false, error: 'WebCodecs VideoEncoder is not supported in this browser' };
    }

    const fullCodecStr = getWebCodecsCodecString(codecKey);
    if (!fullCodecStr) {
        return { supported: false, error: `Unknown codec key: ${codecKey}` };
    }

    const encoderConfig = {
        codec: fullCodecStr,
        width: config.width || 1280,
        height: config.height || 720,
        bitrate: config.bitrate || 1000000,
        framerate: config.framerate || 30,
        latencyMode: 'realtime',
        hardwareAcceleration: config.hardwareAcceleration || 'no-preference'
    };

    // Omit scalabilityMode for non-SVC codecs (VP8, H.264, H.265) when it equals L1T1 (standard single-layer)
    // because browsers reject the configuration if the scalabilityMode dictionary property is present on those codecs.
    if (config.scalabilityMode) {
        const isSVCSupportedCodec = codecKey === 'VP9' || codecKey === 'AV1';
        if (isSVCSupportedCodec || config.scalabilityMode !== 'L1T1') {
            encoderConfig.scalabilityMode = config.scalabilityMode;
        }
    }

    try {
        const support = await VideoEncoder.isConfigSupported(encoderConfig);
        return {
            supported: support.supported,
            config: support.config,
            error: support.supported ? null : 'Configuration not supported by browser static check'
        };
    } catch (err) {
        return { supported: false, error: err.message || err.toString() };
    }
}

/**
 * Verifies WebRTC capabilities statically
 */
export function checkWebRTCStaticSupport(codecKey) {
    if (typeof RTCRtpSender === 'undefined' || !RTCRtpSender.getCapabilities) {
        return { supported: false, error: 'RTCRtpSender capabilities API is not supported' };
    }

    const spec = CODECS[codecKey];
    if (!spec) return { supported: false, error: `Unknown codec key: ${codecKey}` };

    const capabilities = RTCRtpSender.getCapabilities('video');
    if (!capabilities || !capabilities.codecs) {
        return { supported: false, error: 'Unable to retrieve browser WebRTC video capabilities' };
    }

    const isSupported = capabilities.codecs.some(c => {
        return c.mimeType.toLowerCase().includes(spec.webrtcCodecName.toLowerCase());
    });

    return {
        supported: isSupported,
        error: isSupported ? null : `${spec.name} is not supported inside WebRTC on this browser`
    };
}

/**
 * Force specific WebRTC codec in SDP by reordering or removing others
 */
export function forceCodecInSdp(sdp, codecKey) {
    const spec = CODECS[codecKey];
    if (!spec) return sdp;

    const lines = sdp.split('\r\n');
    let videoMLineIdx = -1;
    
    // Locate video m-line
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=video ')) {
            videoMLineIdx = i;
            break;
        }
    }

    if (videoMLineIdx === -1) return sdp;

    const mLine = lines[videoMLineIdx];
    const parts = mLine.split(' ');
    const proto = parts[2];
    const formats = parts.slice(3); // List of Payload Types (PTs)

    // Find Payload Types matching the target codec
    const matchingPTs = [];
    const otherPTs = [];
    const ptMap = new Map(); // Map PT to its rtpmap line

    // Extract Payload Type mapping
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('a=rtpmap:')) {
            const match = line.match(/^a=rtpmap:(\d+)\s+([^\/]+)\/(\d+)/);
            if (match) {
                const pt = match[1];
                const name = match[2];
                ptMap.set(pt, name);
                
                if (name.toLowerCase() === spec.webrtcCodecName.toLowerCase()) {
                    matchingPTs.push(pt);
                } else {
                    otherPTs.push(pt);
                }
            }
        }
    }

    if (matchingPTs.length === 0) {
        return sdp; // Codec not found, return original
    }

    // Construct new m-line where target codec PTs are first
    const newFormats = [...matchingPTs, ...otherPTs];
    parts.splice(3); // Remove existing formats
    const newMLine = [...parts, ...newFormats].join(' ');
    lines[videoMLineIdx] = newMLine;

    // Rejoin lines
    return lines.join('\r\n');
}
