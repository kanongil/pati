'use strict';

// Load modules

const Events = require('events');


// Declare internals

const internals = {
    noResult: Symbol('No result')
};


internals.isEventEmitter = function (obj) {

    // We can rely on instanceof, since it is a built-in type

    return (obj instanceof Events.EventEmitter);
};


internals.isPromise = function (obj) {

    return !!(obj && typeof obj.then === 'function');
};


internals.isDispatcher = function (obj) {

    return (obj instanceof exports.Dispatcher);
};


internals.createDeferred = function () {

    const deferred = {};

    deferred.promise = new Promise((resolve, reject) => {

        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    return deferred;
};


exports.Dispatcher = class {

    constructor(cleanupFn) {

        if (typeof cleanupFn !== 'function') {
            throw new TypeError('"cleanupFn" argument must be a function');
        }

        this.deferred = internals.createDeferred();

        this.deferred.promise.then(cleanupFn, cleanupFn);
    }

    end(result) {

        this.deferred.resolve(result);
    }

    cancel(err) {

        this.deferred.reject(err);
    }

    finish() {

        return this.deferred.promise;
    }

    // Chain promise to life-cycle, causing it to end or cancel dispatcher when fulfilled

    chain(promise) {

        if (!internals.isPromise(promise)) {
            throw new TypeError('"promise" argument must be a Promise');
        }

        promise.then(this.end.bind(this), this.cancel.bind(this));

        return this;
    }

    // Short-circuit - returns promise that rejects with error if dispatcher cancels, or the result of passed promise

    short(promise) {

        if (!internals.isPromise(promise)) {
            throw new TypeError('"promise" argument must be a Promise');
        }

        const rejected = this.deferred.promise;

        return Promise.race([promise, rejected]);
    }

    // Merge the results of another dispatcher
    // The first that returns any result or throws, will be the finished result (race)

    adopt(dispatcher) {

        if (!internals.isDispatcher(dispatcher)) {
            throw new TypeError('"dispatcher" argument must be a Dispatcher');
        }

        dispatcher.finish().then(this.end.bind(this), this.cancel.bind(this));
        this.deferred.promise.then(dispatcher.end.bind(dispatcher), dispatcher.cancel.bind(dispatcher));

        return this;
    }
};


exports.TimeoutDispatcher = class extends exports.Dispatcher {

    constructor(delayMs, result) {

        if (typeof delayMs !== 'number' ||
            !(delayMs >= 0)) {

            throw new TypeError('"delayMs" argument must be a positive number');
        }

        const onTimeout = () => {

            timeout = null;
            return result instanceof Error ? super.cancel(result) : super.end(result);
        };

        const cleanup = () => {

            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
        };

        let timeout = setTimeout(onTimeout, delayMs);

        super(cleanup);
    }

    end() {

        return super.end();
    }

    cancel() {

        return super.end();
    }
};


exports.EventDispatcher = class extends exports.Dispatcher {

    constructor(source, options) {

        options = options || {};

        if (!internals.isEventEmitter(source)) {
            throw new TypeError('"source" must be an EventEmitter');
        }

        if (options.cleanup !== undefined && typeof options.cleanup !== 'function') {
            throw new TypeError('"options.cleanup" must be a function');
        }

        const userCleanup = options.cleanup;
        const cleanup = () => {

            this.removeListeners();
            if (userCleanup) {
                return userCleanup.call(source);
            }
        };

        super(cleanup);

        this.source = source;
        this.processing = 0;

        this._events = [];
        this._endResult = internals.noResult;

        // Special case default error listener to keep it around until after first return from finish()

        const errorListener = this.cancel.bind(this);

        if (options.keepErrorListener) {
            this.removeErrorListener = () => {};
        }
        else {
            this.removeErrorListener = () => {

                this.removeErrorListener = () => {};
                source.removeListener('error', errorListener);
            };
        }

        source.on('error', errorListener);
    }

    removeListeners() {

        if (this.source) {
            for (const { event, handler } of this._events) {
                this.source.removeListener(event, handler);
            }
            this._events = null;
            this.source = null;
        }
    }

    checkFinish(result) {

        if (this._endResult !== internals.noResult) {
            result = this._endResult;
        }

        if (result !== internals.noResult) {
            if (this.processing === 0) {
                super.end(result);
                result = null;                 // Remove internal reference
            }

            this._endResult = result;
        }
    }

    async onEvent(handler, ...args) {

        try {
            ++this.processing;
            try {
                await handler.apply(this, args);
            }
            finally {
                --this.processing;
                this.checkFinish(internals.noResult);
            }
        }
        catch (err) {
            this.deferred.reject(err);
        }
    }

    on(event, handler) {

        if (handler === exports.EventDispatcher.error) {
            handler = this.cancel.bind(this);
        }
        else if (handler === exports.EventDispatcher.end) {
            handler = this.end.bind(this);
        }
        else {
            if (typeof handler !== 'function') {
                throw new TypeError('"handler" argument must be a function');
            }
            handler = this.onEvent.bind(this, handler);
        }

        this.source.on(event, handler);
        this._events.push({ event, handler });
    }

    end(result) {

        // Delay end until all listeners have finished processing
        try {
            this.removeListeners();
            this.checkFinish(result);
        }
        catch (err) {
            this.deferred.reject(err);
        }
    }

    async finish() {

        try {
            return await super.finish();
        }
        finally {
            this.removeErrorListener();
        }
    }
};


exports.EventDispatcher.end = Symbol('EventDispatcher.End');
exports.EventDispatcher.error = Symbol('EventDispatcher.Error');
