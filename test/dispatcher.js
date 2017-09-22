'use strict';

// Load modules

const Events = require('events');

const Code = require('code');
const Lab = require('lab');
const Pati = require('..');


// Declare internals

const internals = {};


internals.delay = function (delay) {

    return new Promise((resolve) => setTimeout(resolve, delay));
};


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('AsyncDispatcher', () => {

    const prepareSimple = (delay = 1) => {

        const emitter = new Events.EventEmitter();
        const dispatcher = new Pati.EventDispatcher(emitter);

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
            setImmediate(() => emitter.emit('close'));

            expect(await dispatcher.finish()).to.not.exist();
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

                internals.delay(1);
                throw new Error('oops');
            });
            emitter.emit('failing');

            await expect(dispatcher.finish()).to.reject(Error, 'oops');
        });
    });
});
