/**
 * WebRTC & WebCodecs Capability Analyzer - Test Execution Engine
 * Manages queue processing, concurrency, capability checks, and state dispatching.
 */

import { checkWebCodecsStaticSupport, checkWebRTCStaticSupport, RESOLUTIONS } from './codec-utils.js';
import { runWebCodecsTest } from './webcodecs-test.js';
import { runWebRTCTest } from './webrtc-test.js';

export class CapabilityTestEngine {
    constructor() {
        this.queue = [];
        this.running = [];
        this.results = new Map(); // maps testId to result object
        
        this.concurrency = 2;
        this.timeoutMs = 10000;
        this.isCancelled = false;
        
        this.stats = {
            pending: 0,
            testing: 0,
            passed: 0,
            failed: 0,
            unsupported: 0
        };

        // Event Callbacks
        this.onTestStarted = null;
        this.onTestCompleted = null;
        this.onProgressUpdate = null;
        this.onSuiteFinished = null;
    }

    /**
     * Configures and runs a full test suite based on selections
     */
    async runSuite(selections, settings) {
        this.isCancelled = false;
        this.concurrency = parseInt(settings.concurrency) || 2;
        this.timeoutMs = (parseInt(settings.timeout) || 10) * 1000;
        
        this.queue = [];
        this.running = [];
        this.results.clear();
        
        this.stats = { pending: 0, testing: 0, passed: 0, failed: 0, unsupported: 0 };

        // 1. Build the testing combinations (Cartesian Product)
        let testIdCounter = 0;
        
        for (const apiType of selections.apiTypes) {
            for (const codecKey of selections.codecs) {
                for (const resKey of selections.resolutions) {
                    const resSpec = RESOLUTIONS[resKey];
                    
                    if (apiType === 'WebCodecs') {
                        // WebCodecs supports testing different hardware preferences
                        for (const hwPref of selections.hardwarePrefs) {
                            // If scalability modes are selected, test them. Otherwise test default (null)
                            const modes = selections.scalabilityModes.length > 0 ? selections.scalabilityModes : [null];
                            for (const mode of modes) {
                                testIdCounter++;
                                const testConfig = {
                                    id: `wc_${testIdCounter}`,
                                    apiType: 'WebCodecs',
                                    codecKey,
                                    resKey,
                                    width: resSpec.width,
                                    height: resSpec.height,
                                    bitrate: resSpec.bitrate,
                                    hardwareAcceleration: hwPref,
                                    scalabilityMode: mode,
                                    status: 'pending',
                                    logs: [],
                                    error: null
                                };
                                this.queue.push(testConfig);
                            }
                        }
                    } else if (apiType === 'WebRTC') {
                        // WebRTC tests
                        const modes = selections.scalabilityModes.length > 0 ? selections.scalabilityModes : [null];
                        for (const mode of modes) {
                            testIdCounter++;
                            const testConfig = {
                                id: `wrtc_${testIdCounter}`,
                                apiType: 'WebRTC',
                                codecKey,
                                resKey,
                                width: resSpec.width,
                                height: resSpec.height,
                                bitrate: resSpec.bitrate,
                                scalabilityMode: mode,
                                isSimulcast: false, // Can be toggled if simulcast option requested
                                hardwareAcceleration: 'no-preference', // N/A for standard WebRTC sender config
                                status: 'pending',
                                logs: [],
                                error: null
                            };
                            this.queue.push(testConfig);
                        }
                    }
                }
            }
        }

        this.stats.pending = this.queue.length;
        this.triggerProgressUpdate();

        // 2. Begin concurrent queue processing
        const workers = [];
        const activeWorkersLimit = Math.min(this.concurrency, this.queue.length);
        
        for (let i = 0; i < activeWorkersLimit; i++) {
            workers.push(this.processQueueWorker());
        }

        await Promise.all(workers);
        
        if (this.onSuiteFinished) {
            this.onSuiteFinished(Array.from(this.results.values()));
        }
    }

    /**
     * Continuous worker that pulls tests from queue and processes them
     */
    async processQueueWorker() {
        while (this.queue.length > 0 && !this.isCancelled) {
            const test = this.queue.shift();
            this.running.push(test);
            
            this.stats.pending--;
            this.stats.testing++;
            test.status = 'testing';
            
            this.triggerProgressUpdate();
            if (this.onTestStarted) this.onTestStarted(test);

            try {
                // A. Perform Static Capability Probing first!
                let isStaticallySupported = true;
                let staticCheckResult = null;

                if (test.apiType === 'WebCodecs') {
                    staticCheckResult = await checkWebCodecsStaticSupport(test.codecKey, {
                        width: test.width,
                        height: test.height,
                        bitrate: test.bitrate,
                        hardwareAcceleration: test.hardwareAcceleration,
                        scalabilityMode: test.scalabilityMode
                    });
                    isStaticallySupported = staticCheckResult.supported;
                } else {
                    staticCheckResult = await checkWebRTCStaticSupport(test.codecKey, {
                        width: test.width,
                        height: test.height,
                        bitrate: test.bitrate,
                        scalabilityMode: test.scalabilityMode
                    });
                    isStaticallySupported = staticCheckResult.supported;
                }

                if (!isStaticallySupported) {
                    // Fail-fast: mark as unsupported directly and skip active loops!
                    test.status = 'unsupported';
                    test.error = staticCheckResult.error || 'Unsupported (Static Capability Check failed)';
                    test.logs = [
                        `[STATIC CHECK] Probe completed. Codec or configuration is NOT supported by the browser.`,
                        `[STATIC CHECK] Error: ${test.error}`
                    ];
                    
                    this.stats.testing--;
                    this.stats.unsupported++;
                } else {
                    // Prepare static check log entries
                    const staticLogs = [
                        `[STATIC CHECK] MediaCapabilities probe completed successfully.`,
                        `[STATIC CHECK] Supported: ${staticCheckResult.supported}`,
                        `[STATIC CHECK] PowerEfficient (Hardware Accelerated): ${staticCheckResult.powerEfficient || false}`,
                        `[STATIC CHECK] Smooth: ${staticCheckResult.smooth || false}`
                    ];

                    // B. Static Check passed. Execute active media testing loops!
                    let runResult = null;
                    if (test.apiType === 'WebCodecs') {
                        runResult = await runWebCodecsTest({
                            codecKey: test.codecKey,
                            width: test.width,
                            height: test.height,
                            bitrate: test.bitrate,
                            scalabilityMode: test.scalabilityMode,
                            hardwareAcceleration: test.hardwareAcceleration,
                            timeoutMs: this.timeoutMs
                        });
                    } else {
                        runResult = await runWebRTCTest({
                            codecKey: test.codecKey,
                            width: test.width,
                            height: test.height,
                            bitrate: test.bitrate,
                            scalabilityMode: test.scalabilityMode,
                            isSimulcast: test.isSimulcast,
                            timeoutMs: this.timeoutMs
                        });
                    }

                    // Merge static probe log with active runner logs
                    test.logs = [...staticLogs, ...runResult.logs];
                    
                    if (runResult.success) {
                        test.status = 'passed';
                        test.stats = {
                            ...(runResult.stats || {}),
                            staticPowerEfficient: staticCheckResult.powerEfficient || false,
                            staticSmooth: staticCheckResult.smooth || false
                        };
                        this.stats.testing--;
                        this.stats.passed++;
                    } else {
                        test.status = 'failed';
                        test.error = runResult.error || 'Unknown active run failure';
                        this.stats.testing--;
                        this.stats.failed++;
                    }
                }
            } catch (err) {
                test.status = 'failed';
                test.error = err.message || err.toString();
                test.logs = [`[EXCEPTION] Exec engine caught uncaught runner exception: ${test.error}`];
                this.stats.testing--;
                this.stats.failed++;
            }

            this.running = this.running.filter(t => t.id !== test.id);
            this.results.set(test.id, test);
            
            this.triggerProgressUpdate();
            if (this.onTestCompleted) this.onTestCompleted(test);
        }
    }

    /**
     * Aborts the active run queue
     */
    cancel() {
        this.isCancelled = true;
        this.queue = [];
        this.running = [];
        log('Test Suite Execution Cancelled by User.');
    }

    triggerProgressUpdate() {
        if (this.onProgressUpdate) {
            this.onProgressUpdate({
                stats: { ...this.stats },
                progress: this.stats.pending === 0 && this.stats.testing === 0 ? 100 : 
                    Math.floor(((this.stats.passed + this.stats.failed + this.stats.unsupported) / 
                    (this.stats.pending + this.stats.testing + this.stats.passed + this.stats.failed + this.stats.unsupported)) * 100)
            });
        }
    }
}

// Simple Logger helper
function log(msg) {
    console.log(`[CapabilityTestEngine] ${msg}`);
}
