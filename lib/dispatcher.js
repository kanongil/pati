'use strict';

// Load modules

const Events = require('events');


// Declare internals

const internals = {};


internals.isEventEmitter = function (obj) {

    // We can rely on instanceof, since it is a built-in type

    return (obj instanceof Events.EventEmitter);
};


internals.createDeferred = function () {

    const deferred = {};

    deferred.promise = new Promise((resolve, reject) => {

        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    return deferred;
};


exports.EventDispatcher = class {

    constructor(source) {

        if (!internals.isEventEmitter(source)) {
            throw new TypeError('"source" must be an EventEmitter');
        }

        this.source = source;
        this.events = [];
        this.processing = 0;
        this.deferred = internals.createDeferred();

        // Register cleanup and prevent uncaught errors

        this.deferred.promise.catch(this.removeListeners.bind(this));

        // Special case default error listener to keep it around until after first return from finish()

        const errorListener = this.cancel.bind(this);

        this.removeErrorListener = () => {

            this.removeErrorListener = () => {};
            source.removeListener('error', errorListener);
        };

        source.on('error', errorListener);
    }

    removeListeners() {

        if (this.source) {
            for (const { event, handler } of this.events) {
                this.source.removeListener(event, handler);
            }
            this.events = null;
            this.source = null;
        }
    }

    checkFinish() {

        if (this.events === null && this.processing === 0) {
            this.deferred.resolve();
        }
    }

    async onEvent(handler, ...args) {

        try {
            ++this.processing;
            try {
                await handler(...args);
            }
            finally {
                --this.processing;
                this.checkFinish();
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
        this.events.push({ event, handler });
    }

    end() {

        try {
            this.removeListeners();
            this.checkFinish();
        }
        catch (err) {
            this.deferred.reject(err);
        }
    }

    cancel(err) {

        this.deferred.reject(err);
    }

    async finish() {

        try {
            await this.deferred.promise;
        }
        finally {
            this.removeErrorListener();
        }
    }
};


exports.EventDispatcher.end = Symbol('EventDispatcher.End');
exports.EventDispatcher.error = Symbol('EventDispatcher.Error');
