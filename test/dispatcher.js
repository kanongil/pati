'use strict';

// Load modules

const Events = require('events');

const Code = require('code');
const Lab = require('lab');
const Pati = require('..');


// Declare internals

const internals = {};


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;

describe('Dispatcher', () => {

    const prepareSimple = (delay = 1, cleanupFn = () => {}) => {

        const dispatcher = new Pati.Dispatcher(cleanupFn);

        if (delay) {
            setTimeout(() => dispatcher.end('done'), delay);
        }

        return dispatcher;
    };

    describe('constructor()', () => {

        it('throws when passed non-function', async () => {

            const setup = () => {

                new Pati.Dispatcher({});
            };

            expect(setup).to.throw(TypeError, '"cleanupFn" argument must be a function');
        });
    });

    describe('async finish()', () => {

        it('calls cleanupFn when resolved', async () => {

            let called = 0;
            const cleanup = () => {

                ++called;
            };

            const dispatcher = new Pati.Dispatcher(cleanup);

            const promise = dispatcher.finish();
            dispatcher.deferred.resolve('ok');
            dispatcher.deferred.reject(new Error('too late'));

            expect(await promise).to.equal('ok');
            expect(called).to.equal(1);
        });

        it('calls cleanupFn when rejected', async () => {

            let called = 0;
            const cleanup = () => {

                ++called;
            };

            const dispatcher = new Pati.Dispatcher(cleanup);

            const promise = dispatcher.finish();
            dispatcher.deferred.reject(new Error('fail'));
            dispatcher.deferred.resolve('too late');

            await expect(promise).to.reject(Error, 'fail');
            expect(called).to.equal(1);
        });

        it('handles consecutive calls', async () => {

            const dispatcher = prepareSimple();

            expect(await dispatcher.finish()).to.equal('done');
            expect(await dispatcher.finish()).to.equal('done');
        });

        it('handles simultaneous calls', async () => {

            const dispatcher = prepareSimple();

            const results = await Promise.all([dispatcher.finish(), dispatcher.finish()]);
            expect(results).to.equal(['done', 'done']);
        });

        it('handles consecutive calls with rejection', async () => {

            const dispatcher = prepareSimple(50);

            setImmediate(() => dispatcher.cancel(new Error('rejected')));

            await expect(dispatcher.finish()).to.reject(Error, new Error('rejected'));
            await expect(dispatcher.finish()).to.reject(Error, new Error('rejected'));
        });

        it('handles simultaneous calls with rejection', async () => {

            const dispatcher = prepareSimple(false);

            setImmediate(() => dispatcher.cancel(new Error('rejected')));

            await Promise.all([
                await expect(dispatcher.finish()).to.reject(Error, new Error('rejected')),
                await expect(dispatcher.finish()).to.reject(Error, new Error('rejected'))
            ]);
        });

        it('ignores cancel() once resolved', async () => {

            const dispatcher = prepareSimple();

            expect(await dispatcher.finish()).to.equal('done');
            dispatcher.cancel(new Error('delayed'));
            expect(await dispatcher.finish()).to.equal('done');
        });
    });

    describe('chain()', () => {

        it('throws on non-promise argument', async () => {

            const setup = (...args) => {

                return () => {

                    const dispatcher = prepareSimple();
                    dispatcher.chain(...args);
                };
            };

            expect(setup(null)).to.throw(Error, '"promise" argument must be a Promise');
            expect(setup({})).to.throw(Error, '"promise" argument must be a Promise');
            expect(setup(false)).to.throw(Error, '"promise" argument must be a Promise');
            expect(setup('hello')).to.throw(Error, '"promise" argument must be a Promise');
        });

        it('allows chaining by returning self', async () => {

            const dispatcher = prepareSimple();
            const promise = new Promise(() => {});

            expect(dispatcher.chain(promise)).to.shallow.equal(dispatcher);
        });

        describe('on a slow dispatcher ends with', () => {

            it('resolved value of chained promise', async () => {

                const dispatcher = prepareSimple(100);
                const promise = new Promise((resolve) => {

                    setImmediate(() => resolve('chained'));
                });

                dispatcher.chain(promise);
                expect(await dispatcher.finish()).to.equal('chained');
            });

            it('resolved value of chained async function result', async () => {

                const dispatcher = prepareSimple(100);
                const asyncFn = async () => {

                    await internals.delay(1);
                    return 'chained';
                };

                dispatcher.chain(asyncFn());
                expect(await dispatcher.finish()).to.equal('chained');
            });

            it('rejected value of chained promise', async () => {

                const dispatcher = prepareSimple(100);
                const promise = new Promise((resolve, reject) => {

                    setImmediate(() => reject(new Error('chained')));
                });

                dispatcher.chain(promise);
                await expect(dispatcher.finish()).to.reject(Error, 'chained');
            });

            it('rejected value of async function result', async () => {

                const dispatcher = prepareSimple(100);
                const asyncFn = async () => {

                    await internals.delay(1);
                    throw new Error('chained');
                };

                dispatcher.chain(asyncFn());
                await expect(dispatcher.finish()).to.reject(Error, 'chained');
            });
        });
    });

    describe('short()', () => {

        it('throws on non-promise argument', async () => {

            const setup = (...args) => {

                return () => {

                    const dispatcher = prepareSimple();
                    dispatcher.short(...args);
                };
            };

            expect(setup(null)).to.throw(Error, '"promise" argument must be a Promise');
            expect(setup({})).to.throw(Error, '"promise" argument must be a Promise');
            expect(setup(false)).to.throw(Error, '"promise" argument must be a Promise');
            expect(setup('hello')).to.throw(Error, '"promise" argument must be a Promise');
        });
    });

    describe('adopt()', () => {

        it('throws on null argument', async () => {

            const setup = () => {

                const dispatcher = prepareSimple();
                dispatcher.adopt(null);
            };

            expect(setup).to.throw(Error, '"dispatcher" argument must be a Dispatcher');
        });

        it('throws on non-dispatcher argument', async () => {

            const setup = () => {

                const dispatcher = prepareSimple();
                dispatcher.adopt(new (function () {})());
            };

            expect(setup).to.throw(Error, '"dispatcher" argument must be a Dispatcher');
        });

        it('allows chaining by returning self', async () => {

            const dispatcher = prepareSimple();
            const adopted = prepareSimple();

            expect(dispatcher.adopt(adopted)).to.shallow.equal(dispatcher);
        });

        describe('when adopted finishes first', () => {

            it('resolves with adopted end() value', async () => {

                const dispatcher = prepareSimple(100);
                const adopted = prepareSimple(false);

                setImmediate(() => adopted.end('adopted'));

                expect(await dispatcher.adopt(adopted).finish()).to.equal('adopted');
                expect(await adopted.deferred.promise).to.equal('adopted');
            });

            it('rejects with adopted cancel() value', async () => {

                const dispatcher = prepareSimple(100);
                const adopted = prepareSimple(false);

                setImmediate(() => adopted.cancel(new Error('adopted')));

                await expect(dispatcher.adopt(adopted).finish()).to.reject(Error, 'adopted');
                await expect(adopted.deferred.promise).to.reject(Error, 'adopted');
            });
        });

        describe('when dispatcher finishes first', () => {

            it('resolves with dispatched end() value', async () => {

                const dispatcher = prepareSimple(false);
                const adopted = prepareSimple(100);

                setImmediate(() => dispatcher.end('dispatched'));

                expect(await dispatcher.adopt(adopted).finish()).to.equal('dispatched');
                expect(await adopted.deferred.promise).to.equal('dispatched');
            });

            it('rejects with dispatched cancel() value', async () => {

                const dispatcher = prepareSimple(false);
                const adopted = prepareSimple(100);

                setImmediate(() => dispatcher.cancel(new Error('dispatched')));

                await expect(dispatcher.adopt(adopted).finish()).to.reject(Error, 'dispatched');
                await expect(adopted.deferred.promise).to.reject(Error, 'dispatched');
            });
        });
    });
});

describe('TimeoutDispatcher', () => {

    const prepareSimple = (delay = 1, result = new Error('timeout')) => {

        return new Pati.TimeoutDispatcher(delay, result);
    };

    describe('constructor()', () => {

        it('throws when passed non-number delay', async () => {

            const setup = (value) => {

                return () => {

                    new Pati.TimeoutDispatcher(value);
                };
            };

            expect(setup()).to.throw(TypeError, '"delayMs" argument must be a positive number');
            expect(setup('10')).to.throw(TypeError, '"delayMs" argument must be a positive number');
            expect(setup(-5)).to.throw(TypeError, '"delayMs" argument must be a positive number');
        });
    });

    describe('end()', () => {

        it('stops the timeout silently', async () => {

            const start = Date.now();
            const dispatcher = prepareSimple(20);

            const promise = dispatcher.finish();
            dispatcher.end('ended');
            expect(await promise).to.not.exist();
            const delay = Date.now() - start;
            expect(delay).to.be.lessThan(20);
        });

        it('clears timeout', { parallel: false }, async () => {

            let cleared = false;

            const orig = clearTimeout;
            clearTimeout = function (timeout) {

                cleared = true;

                clearTimeout = orig;
                return clearTimeout(timeout);
            };

            const dispatcher = prepareSimple(20);

            const promise = dispatcher.finish();
            dispatcher.end('ended');
            expect(await promise).to.not.exist();
            expect(cleared).to.be.true();
        });
    });

    describe('cancel()', () => {

        it('stops the timeout silently, ignoring error', async () => {

            const start = Date.now();
            const dispatcher = prepareSimple(20);

            const promise = dispatcher.finish();
            dispatcher.cancel(new Error('fail'));
            expect(await promise).to.not.exist();
            const delay = Date.now() - start;
            expect(delay).to.be.lessThan(20);
        });

        it('clears timeout', { parallel: false }, async () => {

            let cleared = false;

            const orig = clearTimeout;
            clearTimeout = function (timeout) {

                cleared = true;

                clearTimeout = orig;
                return clearTimeout(timeout);
            };

            const dispatcher = prepareSimple(20);

            const promise = dispatcher.finish();
            dispatcher.cancel(new Error('fail'));
            expect(await promise).to.not.exist();
            expect(cleared).to.be.true();
        });
    });

    describe('async finish()', () => {

        it('rejects with error after timeout', async () => {

            const dispatcher = prepareSimple(20);
            const start = Date.now();

            await expect(dispatcher.finish()).to.reject(Error, 'timeout');
            const delay = Date.now() - start;
            expect(delay).to.be.min(20);
        });

        it('rejects when called after timeout', async () => {

            const dispatcher = prepareSimple(1);

            await internals.delay(20);
            await expect(dispatcher.finish()).to.reject(Error, 'timeout');
        });

        it('resolves with result after timeout', async () => {

            const dispatcher = prepareSimple(20, 'done');
            const start = Date.now();

            expect(await dispatcher.finish()).to.equal('done');
            const delay = Date.now() - start;
            expect(delay).to.be.min(20);
        });
    });
});

describe('AsyncDispatcher', () => {

    const prepareSimple = (delay = 1, options) => {

        const emitter = new Events.EventEmitter();
        const dispatcher = new Pati.EventDispatcher(emitter, options);

        if (delay && delay > 0) {
            dispatcher.on('end', Pati.EventDispatcher.end);
            setTimeout(() => emitter.emit('end'), delay);
        }

        return { emitter, dispatcher };
    };

    describe('constructor()', () => {

        it('handles subclassed emitters', async () => {

            const myType = class extends Events.EventEmitter {};

            const dispatcher = new Pati.EventDispatcher(new myType());
            dispatcher.end();

            expect(await dispatcher.finish()).to.not.exist();
        });

        it('throws when passed non-event emitter', async () => {

            const setup = () => {

                new Pati.EventDispatcher({});
            };

            expect(setup).to.throw(TypeError, '"source" must be an EventEmitter');
        });

        it('cleanup option runs after finish()', async () => {

            let clean = false;
            const cleanup = () => {

                clean = true;
            };

            const { dispatcher } = prepareSimple(1, { cleanup });

            expect(clean).to.be.false();
            expect(await dispatcher.finish()).to.not.exist();
            expect(clean).to.be.true();
        });

        it('throws when passed non-function cleanup option', async () => {

            const setup = () => {

                prepareSimple(false, { cleanup: {} });
            };

            expect(setup).to.throw(TypeError, '"options.cleanup" must be a function');
        });

        it('keepErrorListener option retains the error listener after finish()', async () => {

            const { emitter, dispatcher } = prepareSimple(1, { keepErrorListener: true });

            expect(emitter.listenerCount('error')).to.equal(1);
            expect(await dispatcher.finish()).to.not.exist();
            expect(emitter.listenerCount('error')).to.equal(1);
        });
    });

    describe('on()', () => {

        it('allows custom error listeners', async () => {

            const { emitter, dispatcher } = prepareSimple();

            dispatcher.on('whoosh', Pati.EventDispatcher.error);
            emitter.emit('whoosh', new Error('rejected'));

            await expect(dispatcher.finish()).to.reject(Error, 'rejected');
        });

        it('allows custom end listeners', async () => {

            const { emitter, dispatcher } = prepareSimple(false);

            dispatcher.on('close', Pati.EventDispatcher.end);
            setImmediate(() => emitter.emit('close', 'now'));

            expect(await dispatcher.finish()).to.equal('now');
        });

        it('allows freaky event types', async () => {

            const { emitter, dispatcher } = prepareSimple();
            const privateEvent = Symbol('keep away');

            let dispatched;
            dispatcher.on(privateEvent, (value) => {

                dispatched = value;
            });

            emitter.emit(privateEvent, 'ok');

            expect(await dispatcher.finish()).to.not.exist();
            expect(emitter.listenerCount(privateEvent)).to.equal(0);
            expect(dispatched).to.equal('ok');
        });

        it('throws on invalid handler argument', async () => {

            const { dispatcher } = prepareSimple();

            const onEvent = () => {

                dispatcher.on('event');
            };

            expect(onEvent).to.throw(TypeError, '"handler" argument must be a function');
        });

        it('handler call binds to dispatcher', async () => {

            const { emitter, dispatcher } = prepareSimple(false);

            const onTest = function () {      // Use 'function' here to get called scope

                dispatcher.end(this);
            };
            dispatcher.on('test', onTest);

            emitter.emit('test');

            const result = await dispatcher.finish();
            expect(result).to.shallow.equal(dispatcher);
        });

        it('handler can check state to exit early on errors', async () => {

            const { emitter, dispatcher } = prepareSimple(100);

            let processPromise;
            const onProcess = async function () {

                processPromise = this.short(internals.delay(200));
                await processPromise;
                console.log('never called');
            };

            dispatcher.on('process', onProcess);
            emitter.emit('process');

            dispatcher.cancel(new Error('abort'));

            await expect(dispatcher.finish()).to.reject(Error, new Error('abort'));
            await expect(processPromise).to.reject(Error, new Error('abort'));
        });
    });

    describe('end()', () => {

        it('immediately removes added listeners', async () => {

            const { emitter, dispatcher } = prepareSimple();

            let processStage = 0;
            dispatcher.on('event', async () => {

                ++processStage;
                await internals.delay(1);
                ++processStage;
            });

            emitter.emit('event');

            expect(emitter.listenerCount('event')).to.equal(1);
            expect(emitter.listenerCount('end')).to.equal(1);
            expect(emitter.listenerCount('error')).to.equal(1);
            expect(processStage).to.equal(1);

            dispatcher.end();

            expect(emitter.listenerCount('event')).to.equal(0);
            expect(emitter.listenerCount('end')).to.equal(0);
            expect(emitter.listenerCount('error')).to.equal(1);
            expect(processStage).to.equal(1);

            expect(await dispatcher.finish()).to.not.exist();
            expect(emitter.listenerCount('error')).to.equal(0);
            expect(processStage).to.equal(2);
        });

        it('internal errors causes finish() to reject', async () => {

            const { dispatcher } = prepareSimple();

            // Fake internal error

            dispatcher.checkFinish = () => {           // Called during end() processing

                throw Error('wtf');
            };

            await expect(dispatcher.finish()).to.reject(Error, 'wtf');
        });
    });

    describe('async finish()', () => {

        it('handles consecutive calls', async () => {

            const { dispatcher } = prepareSimple();

            expect(await dispatcher.finish()).to.not.exist();
            expect(await dispatcher.finish()).to.not.exist();
        });

        it('handles simultaneous calls', async () => {

            const { dispatcher } = prepareSimple();

            await Promise.all([dispatcher.finish(), dispatcher.finish()]);
        });

        it('handles consecutive calls with rejection', async () => {

            const { emitter, dispatcher } = prepareSimple(false);

            setImmediate(() => emitter.emit('error', new Error('rejected')));

            await expect(dispatcher.finish()).to.reject(Error, new Error('rejected'));
            await expect(dispatcher.finish()).to.reject(Error, new Error('rejected'));
        });

        it('handles simultaneous calls with rejection', async () => {

            const { emitter, dispatcher } = prepareSimple(false);

            setImmediate(() => emitter.emit('error', new Error('rejected')));

            await Promise.all([
                await expect(dispatcher.finish()).to.reject(Error, new Error('rejected')),
                await expect(dispatcher.finish()).to.reject(Error, new Error('rejected'))
            ]);
        });

        it('ignores errors once resolved', async () => {

            const { emitter, dispatcher } = prepareSimple();

            emitter.on('error', () => { });                     // Ignore error to avoid exception

            expect(await dispatcher.finish()).to.not.exist();
            emitter.emit('error', new Error('delayed'));
            expect(await dispatcher.finish()).to.not.exist();
        });

        it('removes listeners once resolved', async () => {

            const { emitter, dispatcher } = prepareSimple();

            expect(emitter.listenerCount('end')).to.equal(1);
            expect(emitter.listenerCount('error')).to.equal(1);

            expect(await dispatcher.finish()).to.not.exist();

            expect(emitter.listenerCount('end')).to.equal(0);
            expect(emitter.listenerCount('error')).to.equal(0);
        });

        it('removes listeners once rejected', async () => {

            const { emitter, dispatcher } = prepareSimple(100);

            expect(emitter.listenerCount('end')).to.equal(1);
            expect(emitter.listenerCount('error')).to.equal(1);

            setImmediate(() => emitter.emit('error', new Error('rejected')));

            await expect(dispatcher.finish()).to.reject(Error, 'rejected');

            expect(emitter.listenerCount('end')).to.equal(0);
            expect(emitter.listenerCount('error')).to.equal(0);
        });

        it('rejects when a handler throws inline', async () => {

            const { emitter, dispatcher } = prepareSimple(100);

            dispatcher.on('failing', () => {

                throw new Error('oops');
            });
            setImmediate(() => emitter.emit('failing'));

            await expect(dispatcher.finish()).to.reject(Error, 'oops');
        });

        it('rejects when a handler throws async', async () => {

            const { emitter, dispatcher } = prepareSimple(100);

            dispatcher.on('failing', async () => {

                await internals.delay(1);
                throw new Error('oops');
            });
            emitter.emit('failing');

            await expect(dispatcher.finish()).to.reject(Error, 'oops');
        });
    });
});


internals.delay = function (delay) {

    return new Promise((resolve) => setTimeout(resolve, delay));
};
