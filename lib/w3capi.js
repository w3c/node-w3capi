(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.w3capi = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
var sua = require("superagent")
,   util = require("util")
,   async = require("async")
;

// this is the base URL we use, which can be overridden
exports.baseURL = "https://api.w3.org/";

// this is the API key, you have to set it
exports.apiKey = null;

// Authorisation mode: 'header' for HTTP header; 'param' for query parameter.
exports.authMode = 'header';

// slurping helper
function makeRequest (url, embed, page) {
    var query = {}
    ,   result = sua.get(url);
    if (embed) query.embed = "true";
    if (page) query.page = page;
    if (!exports.apiKey) throw new Error("No API key.");
    if ('header' === exports.authMode) result.set('Authorization', 'W3C-API apikey="' + exports.apiKey + '"');
    else if ('param' === exports.authMode) query.apikey = exports.apiKey;
    else throw new Error("Invalid authorisation mode.");
    return result.accept("json")
                 .query(query)
    ;
}

// defend against antipattern of using scalars when an array only has one item
function arrayify (obj) {
    if (!Array.isArray(obj)) return [obj];
    return obj;
}

// contexts are used to make for a nice API
function Ctx (ctx) {
    this.steps = ctx ? ctx.steps.concat([]) : [];
}
Ctx.prototype.fetch = function (options, cb) {
    if (typeof options === "function") {
        cb = options;
        options = {};
    }
    var url = exports.baseURL + this.steps.join("/")
    ,   embed = options && options.embed
    ,   request = makeRequest(url, embed)
    ,   type = this.type || "item"
    ,   key = this.linkKey
    ,   embedKey = embed ? "_embedded" : "_links"
    ;

    // what we want is to make one first request
    // if it has all the data, just return that
    // if not, then generate all the requests for each page, grab them all, collate the data, return that
    request.end(function (err, res) {
        if (err) return cb(err);
        if (!res.ok) return cb(res.text);
        var body = res.body;
        // if what we were fetching was a single item, we're good
        if (type === "item") return cb(null, res.body);
        // if it's a list but it has only one page, we're good
        if (body.pages == 1) return cb(null, arrayify(body[embedKey][key]));
        // otherwise we're dealing with a list that may be paged
        var reqs = []
        ,   page = 1
        ;
        while (page < body.pages) {
            page++;
            reqs.push(makeRequest(url, embed, page));
        }
        async.map(
            reqs
        ,   function (req, cb) {
                req.end(function (err, res) {
                    if (err) return cb(err);
                    if (!res.ok) return cb(res.text);
                    cb(null, arrayify(res.body[embedKey][key]));
                });
            }
        ,   function (err, allRes) {
                if (err) return cb(err);
                var allData = arrayify(body[embedKey][key]);
                allRes.forEach(function (res) { allData = allData.concat(res); });
                cb(null, allData);
            }
        );
    });
};

// generates a function for the root list
function rootList (type) {
    return function () {
        var ctx = new Ctx();
        ctx.type = "list";
        ctx.linkKey = type;
        ctx.steps = [type];
        return ctx;
    };
}

// generates steps beneath an existing one that has an ID
function subSteps (obj, items) {
    util.inherits(obj, Ctx);

    var key = "teamcontacts versions successors predecessors".split(" ")
    ,   propKey = "team-contacts version-history successor-version predecessor-version".split(" ");
    items.forEach(function (it) {
        obj.prototype[it] = function () {
            this.steps.push(it);
            this.type = "list";
            var i = key.indexOf(it);
            this.linkKey = (i >= 0) ? propKey[i] : it;
            return this;
        };
    });
}

// generates a step that takes an ID
function idStep (obj, name, inherit) {
    return function (id) {
        var ctx = obj ? new obj(inherit ? this : undefined) : this;
        ctx.steps.push(name);
        ctx.steps.push(id);
        return ctx;
    };
}

//------------------------------------- 1. Functions

exports.functions = rootList('functions');

function FunctionCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(FunctionCtx, ['services', 'users']);
exports.function = idStep(FunctionCtx, 'functions');

//------------------------------------- 2. Groups

exports.groups = rootList("groups");

function GroupCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(GroupCtx, ["chairs", "services", "specifications", "teamcontacts", "users", "charters", "participations"]);

function shortnameOrIdStep(obj, name) {
    return shortnameOrId => {
        if (typeof shortnameOrId === 'number') {
            // W3C group id
            return idStep(obj, name)(shortnameOrId);
        } else {
            var ctx = new obj();
            ctx.steps.push(name);
            ctx.steps.push(shortnameOrId.type);
            ctx.steps.push(shortnameOrId.shortname);
            return ctx;
        }
    };
}

GroupCtx.prototype.charter = idStep(null, "charters");


exports.group = shortnameOrIdStep(GroupCtx, "groups");

//------------------------------------- 3. Services

function ServiceCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(ServiceCtx, ["groups"]);
exports.service = idStep(ServiceCtx, "services");

//------------------------------------- 4. Specs

exports.specifications = rootList("specifications");

function SpecificationCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(SpecificationCtx, ["superseded", "supersedes", "versions"]);

SpecificationCtx.prototype.latest = function () {
    this.steps.push("versions");
    this.steps.push("latest");
    return this;
};

function VersionCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(VersionCtx, ["deliverers", "editors", "successors", "predecessors"]);
SpecificationCtx.prototype.version = idStep(VersionCtx, "versions", true);
exports.specification = idStep(SpecificationCtx, "specifications");

//------------------------------------- 5. Users

function UserCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(UserCtx, ["affiliations", "groups", "participations", "specifications"]);

UserCtx.prototype.teamcontactofgroups = function() {
    this.steps.push('team-contact-of-groups');
    this.type = "list";
    this.linkKey = "groups";
    return this;
}

// generates a step that takes either an account object or an ID
function accountOrIdStep(obj, name) {
    return function (accountOrId) {
        if (typeof accountOrId === 'string') {
            // W3C obfuscated id
            return idStep(obj, name)(accountOrId);
        } else {
            // accountOrId expected to be {type: 'github', id: 123456}
            var ctx = new obj();
            ctx.steps.push(name);
            ctx.steps.push("connected");
            ctx.steps.push(accountOrId.type);
            ctx.steps.push(accountOrId.id);
            return ctx;
        }
    };
}

exports.user = accountOrIdStep(UserCtx, "users");

//------------------------------------- 6. Affiliations

exports.affiliations = rootList('affiliations');

function AffiliationCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(AffiliationCtx, ['participants', 'participations']);
exports.affiliation = idStep(AffiliationCtx, 'affiliations');

//------------------------------------- 7. Participations

function ParticipationCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(ParticipationCtx, ['participants']);
exports.participation = idStep(ParticipationCtx, 'participations');

//------------------------------------- 8. Translations

exports.translations = rootList("translations");

function TranslationCtx (ctx) {
    Ctx.call(this, ctx);
}

// FIXME: idStep assumes subSteps has been run before
subSteps(TranslationCtx, []);
exports.translation = idStep(TranslationCtx, 'translations');

//------------------------------------- 9. Call for Translations

exports.callsfortranslation = rootList("callsfortranslation");

function CallForTranslationCtx (ctx) {
    Ctx.call(this, ctx);
}

// FIXME: idStep assumes subSteps has been run before
subSteps(CallForTranslationCtx, []);
exports.callfortranslation = idStep(CallForTranslationCtx, 'callsfortranslation');

//------------------------------------- 10. Non-participant Licensing commitments

exports.nplcs = rootList("nplcs");

function NplcCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(NplcCtx, ['']);
function contributionStep(obj, name) {
    return function (contribution) {
        var ctx = new obj();
        ctx.steps.push(name);
        ctx.steps.push(contribution.repoId);
        ctx.steps.push(contribution.pr);
        return ctx;
    };
}

exports.nplc = contributionStep(NplcCtx, 'nplcs');

//------------------------------------- 11. Specification series

function SeriesCtx (ctx) {
    Ctx.call(this, ctx);
}

subSteps(SeriesCtx, ['specifications']);

exports.specificationseries = idStep(SeriesCtx, 'specification-series');

},{"async":3,"superagent":31,"util":39}],2:[function(require,module,exports){

/**
 * Array#filter.
 *
 * @param {Array} arr
 * @param {Function} fn
 * @param {Object=} self
 * @return {Array}
 * @throw TypeError
 */

module.exports = function (arr, fn, self) {
  if (arr.filter) return arr.filter(fn, self);
  if (void 0 === arr || null === arr) throw new TypeError;
  if ('function' != typeof fn) throw new TypeError;
  var ret = [];
  for (var i = 0; i < arr.length; i++) {
    if (!hasOwn.call(arr, i)) continue;
    var val = arr[i];
    if (fn.call(self, val, i, arr)) ret.push(val);
  }
  return ret;
};

var hasOwn = Object.prototype.hasOwnProperty;

},{}],3:[function(require,module,exports){
(function (process,setImmediate){(function (){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (factory((global.async = {})));
}(this, (function (exports) { 'use strict';

    /**
     * Creates a continuation function with some arguments already applied.
     *
     * Useful as a shorthand when combined with other control flow functions. Any
     * arguments passed to the returned function are added to the arguments
     * originally passed to apply.
     *
     * @name apply
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {Function} fn - The function you want to eventually apply all
     * arguments to. Invokes with (arguments...).
     * @param {...*} arguments... - Any number of arguments to automatically apply
     * when the continuation is called.
     * @returns {Function} the partially-applied function
     * @example
     *
     * // using apply
     * async.parallel([
     *     async.apply(fs.writeFile, 'testfile1', 'test1'),
     *     async.apply(fs.writeFile, 'testfile2', 'test2')
     * ]);
     *
     *
     * // the same process without using apply
     * async.parallel([
     *     function(callback) {
     *         fs.writeFile('testfile1', 'test1', callback);
     *     },
     *     function(callback) {
     *         fs.writeFile('testfile2', 'test2', callback);
     *     }
     * ]);
     *
     * // It's possible to pass any number of additional arguments when calling the
     * // continuation:
     *
     * node> var fn = async.apply(sys.puts, 'one');
     * node> fn('two', 'three');
     * one
     * two
     * three
     */
    function apply(fn, ...args) {
        return (...callArgs) => fn(...args,...callArgs);
    }

    function initialParams (fn) {
        return function (...args/*, callback*/) {
            var callback = args.pop();
            return fn.call(this, args, callback);
        };
    }

    /* istanbul ignore file */

    var hasSetImmediate = typeof setImmediate === 'function' && setImmediate;
    var hasNextTick = typeof process === 'object' && typeof process.nextTick === 'function';

    function fallback(fn) {
        setTimeout(fn, 0);
    }

    function wrap(defer) {
        return (fn, ...args) => defer(() => fn(...args));
    }

    var _defer;

    if (hasSetImmediate) {
        _defer = setImmediate;
    } else if (hasNextTick) {
        _defer = process.nextTick;
    } else {
        _defer = fallback;
    }

    var setImmediate$1 = wrap(_defer);

    /**
     * Take a sync function and make it async, passing its return value to a
     * callback. This is useful for plugging sync functions into a waterfall,
     * series, or other async functions. Any arguments passed to the generated
     * function will be passed to the wrapped function (except for the final
     * callback argument). Errors thrown will be passed to the callback.
     *
     * If the function passed to `asyncify` returns a Promise, that promises's
     * resolved/rejected state will be used to call the callback, rather than simply
     * the synchronous return value.
     *
     * This also means you can asyncify ES2017 `async` functions.
     *
     * @name asyncify
     * @static
     * @memberOf module:Utils
     * @method
     * @alias wrapSync
     * @category Util
     * @param {Function} func - The synchronous function, or Promise-returning
     * function to convert to an {@link AsyncFunction}.
     * @returns {AsyncFunction} An asynchronous wrapper of the `func`. To be
     * invoked with `(args..., callback)`.
     * @example
     *
     * // passing a regular synchronous function
     * async.waterfall([
     *     async.apply(fs.readFile, filename, "utf8"),
     *     async.asyncify(JSON.parse),
     *     function (data, next) {
     *         // data is the result of parsing the text.
     *         // If there was a parsing error, it would have been caught.
     *     }
     * ], callback);
     *
     * // passing a function returning a promise
     * async.waterfall([
     *     async.apply(fs.readFile, filename, "utf8"),
     *     async.asyncify(function (contents) {
     *         return db.model.create(contents);
     *     }),
     *     function (model, next) {
     *         // `model` is the instantiated model object.
     *         // If there was an error, this function would be skipped.
     *     }
     * ], callback);
     *
     * // es2017 example, though `asyncify` is not needed if your JS environment
     * // supports async functions out of the box
     * var q = async.queue(async.asyncify(async function(file) {
     *     var intermediateStep = await processFile(file);
     *     return await somePromise(intermediateStep)
     * }));
     *
     * q.push(files);
     */
    function asyncify(func) {
        if (isAsync(func)) {
            return function (...args/*, callback*/) {
                const callback = args.pop();
                const promise = func.apply(this, args);
                return handlePromise(promise, callback)
            }
        }

        return initialParams(function (args, callback) {
            var result;
            try {
                result = func.apply(this, args);
            } catch (e) {
                return callback(e);
            }
            // if result is Promise object
            if (result && typeof result.then === 'function') {
                return handlePromise(result, callback)
            } else {
                callback(null, result);
            }
        });
    }

    function handlePromise(promise, callback) {
        return promise.then(value => {
            invokeCallback(callback, null, value);
        }, err => {
            invokeCallback(callback, err && err.message ? err : new Error(err));
        });
    }

    function invokeCallback(callback, error, value) {
        try {
            callback(error, value);
        } catch (err) {
            setImmediate$1(e => { throw e }, err);
        }
    }

    function isAsync(fn) {
        return fn[Symbol.toStringTag] === 'AsyncFunction';
    }

    function isAsyncGenerator(fn) {
        return fn[Symbol.toStringTag] === 'AsyncGenerator';
    }

    function isAsyncIterable(obj) {
        return typeof obj[Symbol.asyncIterator] === 'function';
    }

    function wrapAsync(asyncFn) {
        if (typeof asyncFn !== 'function') throw new Error('expected a function')
        return isAsync(asyncFn) ? asyncify(asyncFn) : asyncFn;
    }

    // conditionally promisify a function.
    // only return a promise if a callback is omitted
    function awaitify (asyncFn, arity = asyncFn.length) {
        if (!arity) throw new Error('arity is undefined')
        function awaitable (...args) {
            if (typeof args[arity - 1] === 'function') {
                return asyncFn.apply(this, args)
            }

            return new Promise((resolve, reject) => {
                args[arity - 1] = (err, ...cbArgs) => {
                    if (err) return reject(err)
                    resolve(cbArgs.length > 1 ? cbArgs : cbArgs[0]);
                };
                asyncFn.apply(this, args);
            })
        }

        return awaitable
    }

    function applyEach (eachfn) {
        return function applyEach(fns, ...callArgs) {
            const go = awaitify(function (callback) {
                var that = this;
                return eachfn(fns, (fn, cb) => {
                    wrapAsync(fn).apply(that, callArgs.concat(cb));
                }, callback);
            });
            return go;
        };
    }

    function _asyncMap(eachfn, arr, iteratee, callback) {
        arr = arr || [];
        var results = [];
        var counter = 0;
        var _iteratee = wrapAsync(iteratee);

        return eachfn(arr, (value, _, iterCb) => {
            var index = counter++;
            _iteratee(value, (err, v) => {
                results[index] = v;
                iterCb(err);
            });
        }, err => {
            callback(err, results);
        });
    }

    function isArrayLike(value) {
        return value &&
            typeof value.length === 'number' &&
            value.length >= 0 &&
            value.length % 1 === 0;
    }

    // A temporary value used to identify if the loop should be broken.
    // See #1064, #1293
    const breakLoop = {};

    function once(fn) {
        function wrapper (...args) {
            if (fn === null) return;
            var callFn = fn;
            fn = null;
            callFn.apply(this, args);
        }
        Object.assign(wrapper, fn);
        return wrapper
    }

    function getIterator (coll) {
        return coll[Symbol.iterator] && coll[Symbol.iterator]();
    }

    function createArrayIterator(coll) {
        var i = -1;
        var len = coll.length;
        return function next() {
            return ++i < len ? {value: coll[i], key: i} : null;
        }
    }

    function createES2015Iterator(iterator) {
        var i = -1;
        return function next() {
            var item = iterator.next();
            if (item.done)
                return null;
            i++;
            return {value: item.value, key: i};
        }
    }

    function createObjectIterator(obj) {
        var okeys = obj ? Object.keys(obj) : [];
        var i = -1;
        var len = okeys.length;
        return function next() {
            var key = okeys[++i];
            return i < len ? {value: obj[key], key} : null;
        };
    }

    function createIterator(coll) {
        if (isArrayLike(coll)) {
            return createArrayIterator(coll);
        }

        var iterator = getIterator(coll);
        return iterator ? createES2015Iterator(iterator) : createObjectIterator(coll);
    }

    function onlyOnce(fn) {
        return function (...args) {
            if (fn === null) throw new Error("Callback was already called.");
            var callFn = fn;
            fn = null;
            callFn.apply(this, args);
        };
    }

    // for async generators
    function asyncEachOfLimit(generator, limit, iteratee, callback) {
        let done = false;
        let canceled = false;
        let awaiting = false;
        let running = 0;
        let idx = 0;

        function replenish() {
            //console.log('replenish')
            if (running >= limit || awaiting || done) return
            //console.log('replenish awaiting')
            awaiting = true;
            generator.next().then(({value, done: iterDone}) => {
                //console.log('got value', value)
                if (canceled || done) return
                awaiting = false;
                if (iterDone) {
                    done = true;
                    if (running <= 0) {
                        //console.log('done nextCb')
                        callback(null);
                    }
                    return;
                }
                running++;
                iteratee(value, idx, iterateeCallback);
                idx++;
                replenish();
            }).catch(handleError);
        }

        function iterateeCallback(err, result) {
            //console.log('iterateeCallback')
            running -= 1;
            if (canceled) return
            if (err) return handleError(err)

            if (err === false) {
                done = true;
                canceled = true;
                return
            }

            if (result === breakLoop || (done && running <= 0)) {
                done = true;
                //console.log('done iterCb')
                return callback(null);
            }
            replenish();
        }

        function handleError(err) {
            if (canceled) return
            awaiting = false;
            done = true;
            callback(err);
        }

        replenish();
    }

    var eachOfLimit = (limit) => {
        return (obj, iteratee, callback) => {
            callback = once(callback);
            if (limit <= 0) {
                throw new RangeError('concurrency limit cannot be less than 1')
            }
            if (!obj) {
                return callback(null);
            }
            if (isAsyncGenerator(obj)) {
                return asyncEachOfLimit(obj, limit, iteratee, callback)
            }
            if (isAsyncIterable(obj)) {
                return asyncEachOfLimit(obj[Symbol.asyncIterator](), limit, iteratee, callback)
            }
            var nextElem = createIterator(obj);
            var done = false;
            var canceled = false;
            var running = 0;
            var looping = false;

            function iterateeCallback(err, value) {
                if (canceled) return
                running -= 1;
                if (err) {
                    done = true;
                    callback(err);
                }
                else if (err === false) {
                    done = true;
                    canceled = true;
                }
                else if (value === breakLoop || (done && running <= 0)) {
                    done = true;
                    return callback(null);
                }
                else if (!looping) {
                    replenish();
                }
            }

            function replenish () {
                looping = true;
                while (running < limit && !done) {
                    var elem = nextElem();
                    if (elem === null) {
                        done = true;
                        if (running <= 0) {
                            callback(null);
                        }
                        return;
                    }
                    running += 1;
                    iteratee(elem.value, elem.key, onlyOnce(iterateeCallback));
                }
                looping = false;
            }

            replenish();
        };
    };

    /**
     * The same as [`eachOf`]{@link module:Collections.eachOf} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name eachOfLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.eachOf]{@link module:Collections.eachOf}
     * @alias forEachOfLimit
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - An async function to apply to each
     * item in `coll`. The `key` is the item's key, or index in the case of an
     * array.
     * Invoked with (item, key, callback).
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     * @returns {Promise} a promise, if a callback is omitted
     */
    function eachOfLimit$1(coll, limit, iteratee, callback) {
        return eachOfLimit(limit)(coll, wrapAsync(iteratee), callback);
    }

    var eachOfLimit$2 = awaitify(eachOfLimit$1, 4);

    // eachOf implementation optimized for array-likes
    function eachOfArrayLike(coll, iteratee, callback) {
        callback = once(callback);
        var index = 0,
            completed = 0,
            {length} = coll,
            canceled = false;
        if (length === 0) {
            callback(null);
        }

        function iteratorCallback(err, value) {
            if (err === false) {
                canceled = true;
            }
            if (canceled === true) return
            if (err) {
                callback(err);
            } else if ((++completed === length) || value === breakLoop) {
                callback(null);
            }
        }

        for (; index < length; index++) {
            iteratee(coll[index], index, onlyOnce(iteratorCallback));
        }
    }

    // a generic version of eachOf which can handle array, object, and iterator cases.
    function eachOfGeneric (coll, iteratee, callback) {
        return eachOfLimit$2(coll, Infinity, iteratee, callback);
    }

    /**
     * Like [`each`]{@link module:Collections.each}, except that it passes the key (or index) as the second argument
     * to the iteratee.
     *
     * @name eachOf
     * @static
     * @memberOf module:Collections
     * @method
     * @alias forEachOf
     * @category Collection
     * @see [async.each]{@link module:Collections.each}
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - A function to apply to each
     * item in `coll`.
     * The `key` is the item's key, or index in the case of an array.
     * Invoked with (item, key, callback).
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     * @returns {Promise} a promise, if a callback is omitted
     * @example
     *
     * var obj = {dev: "/dev.json", test: "/test.json", prod: "/prod.json"};
     * var configs = {};
     *
     * async.forEachOf(obj, function (value, key, callback) {
     *     fs.readFile(__dirname + value, "utf8", function (err, data) {
     *         if (err) return callback(err);
     *         try {
     *             configs[key] = JSON.parse(data);
     *         } catch (e) {
     *             return callback(e);
     *         }
     *         callback();
     *     });
     * }, function (err) {
     *     if (err) console.error(err.message);
     *     // configs is now a map of JSON data
     *     doSomethingWith(configs);
     * });
     */
    function eachOf(coll, iteratee, callback) {
        var eachOfImplementation = isArrayLike(coll) ? eachOfArrayLike : eachOfGeneric;
        return eachOfImplementation(coll, wrapAsync(iteratee), callback);
    }

    var eachOf$1 = awaitify(eachOf, 3);

    /**
     * Produces a new collection of values by mapping each value in `coll` through
     * the `iteratee` function. The `iteratee` is called with an item from `coll`
     * and a callback for when it has finished processing. Each of these callback
     * takes 2 arguments: an `error`, and the transformed item from `coll`. If
     * `iteratee` passes an error to its callback, the main `callback` (for the
     * `map` function) is immediately called with the error.
     *
     * Note, that since this function applies the `iteratee` to each item in
     * parallel, there is no guarantee that the `iteratee` functions will complete
     * in order. However, the results array will be in the same order as the
     * original `coll`.
     *
     * If `map` is passed an Object, the results will be an Array.  The results
     * will roughly be in the order of the original Objects' keys (but this can
     * vary across JavaScript engines).
     *
     * @name map
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * The iteratee should complete with the transformed item.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Results is an Array of the
     * transformed items from the `coll`. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback is passed
     * @example
     *
     * async.map(['file1','file2','file3'], fs.stat, function(err, results) {
     *     // results is now an array of stats for each file
     * });
     */
    function map (coll, iteratee, callback) {
        return _asyncMap(eachOf$1, coll, iteratee, callback)
    }
    var map$1 = awaitify(map, 3);

    /**
     * Applies the provided arguments to each function in the array, calling
     * `callback` after all functions have completed. If you only provide the first
     * argument, `fns`, then it will return a function which lets you pass in the
     * arguments as if it were a single function call. If more arguments are
     * provided, `callback` is required while `args` is still optional. The results
     * for each of the applied async functions are passed to the final callback
     * as an array.
     *
     * @name applyEach
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array|Iterable|AsyncIterable|Object} fns - A collection of {@link AsyncFunction}s
     * to all call with the same arguments
     * @param {...*} [args] - any number of separate arguments to pass to the
     * function.
     * @param {Function} [callback] - the final argument should be the callback,
     * called when all functions have completed processing.
     * @returns {AsyncFunction} - Returns a function that takes no args other than
     * an optional callback, that is the result of applying the `args` to each
     * of the functions.
     * @example
     *
     * const appliedFn = async.applyEach([enableSearch, updateSchema], 'bucket')
     *
     * appliedFn((err, results) => {
     *     // results[0] is the results for `enableSearch`
     *     // results[1] is the results for `updateSchema`
     * });
     *
     * // partial application example:
     * async.each(
     *     buckets,
     *     async (bucket) => async.applyEach([enableSearch, updateSchema], bucket)(),
     *     callback
     * );
     */
    var applyEach$1 = applyEach(map$1);

    /**
     * The same as [`eachOf`]{@link module:Collections.eachOf} but runs only a single async operation at a time.
     *
     * @name eachOfSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.eachOf]{@link module:Collections.eachOf}
     * @alias forEachOfSeries
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * Invoked with (item, key, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Invoked with (err).
     * @returns {Promise} a promise, if a callback is omitted
     */
    function eachOfSeries(coll, iteratee, callback) {
        return eachOfLimit$2(coll, 1, iteratee, callback)
    }
    var eachOfSeries$1 = awaitify(eachOfSeries, 3);

    /**
     * The same as [`map`]{@link module:Collections.map} but runs only a single async operation at a time.
     *
     * @name mapSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.map]{@link module:Collections.map}
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * The iteratee should complete with the transformed item.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Results is an array of the
     * transformed items from the `coll`. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback is passed
     */
    function mapSeries (coll, iteratee, callback) {
        return _asyncMap(eachOfSeries$1, coll, iteratee, callback)
    }
    var mapSeries$1 = awaitify(mapSeries, 3);

    /**
     * The same as [`applyEach`]{@link module:ControlFlow.applyEach} but runs only a single async operation at a time.
     *
     * @name applyEachSeries
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.applyEach]{@link module:ControlFlow.applyEach}
     * @category Control Flow
     * @param {Array|Iterable|AsyncIterable|Object} fns - A collection of {@link AsyncFunction}s to all
     * call with the same arguments
     * @param {...*} [args] - any number of separate arguments to pass to the
     * function.
     * @param {Function} [callback] - the final argument should be the callback,
     * called when all functions have completed processing.
     * @returns {AsyncFunction} - A function, that when called, is the result of
     * appling the `args` to the list of functions.  It takes no args, other than
     * a callback.
     */
    var applyEachSeries = applyEach(mapSeries$1);

    const PROMISE_SYMBOL = Symbol('promiseCallback');

    function promiseCallback () {
        let resolve, reject;
        function callback (err, ...args) {
            if (err) return reject(err)
            resolve(args.length > 1 ? args : args[0]);
        }

        callback[PROMISE_SYMBOL] = new Promise((res, rej) => {
            resolve = res,
            reject = rej;
        });

        return callback
    }

    /**
     * Determines the best order for running the {@link AsyncFunction}s in `tasks`, based on
     * their requirements. Each function can optionally depend on other functions
     * being completed first, and each function is run as soon as its requirements
     * are satisfied.
     *
     * If any of the {@link AsyncFunction}s pass an error to their callback, the `auto` sequence
     * will stop. Further tasks will not execute (so any other functions depending
     * on it will not run), and the main `callback` is immediately called with the
     * error.
     *
     * {@link AsyncFunction}s also receive an object containing the results of functions which
     * have completed so far as the first argument, if they have dependencies. If a
     * task function has no dependencies, it will only be passed a callback.
     *
     * @name auto
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Object} tasks - An object. Each of its properties is either a
     * function or an array of requirements, with the {@link AsyncFunction} itself the last item
     * in the array. The object's key of a property serves as the name of the task
     * defined by that property, i.e. can be used when specifying requirements for
     * other tasks. The function receives one or two arguments:
     * * a `results` object, containing the results of the previously executed
     *   functions, only passed if the task has any dependencies,
     * * a `callback(err, result)` function, which must be called when finished,
     *   passing an `error` (which can be `null`) and the result of the function's
     *   execution.
     * @param {number} [concurrency=Infinity] - An optional `integer` for
     * determining the maximum number of tasks that can be run in parallel. By
     * default, as many as possible.
     * @param {Function} [callback] - An optional callback which is called when all
     * the tasks have been completed. It receives the `err` argument if any `tasks`
     * pass an error to their callback. Results are always returned; however, if an
     * error occurs, no further `tasks` will be performed, and the results object
     * will only contain partial results. Invoked with (err, results).
     * @returns {Promise} a promise, if a callback is not passed
     * @example
     *
     * async.auto({
     *     // this function will just be passed a callback
     *     readData: async.apply(fs.readFile, 'data.txt', 'utf-8'),
     *     showData: ['readData', function(results, cb) {
     *         // results.readData is the file's contents
     *         // ...
     *     }]
     * }, callback);
     *
     * async.auto({
     *     get_data: function(callback) {
     *         console.log('in get_data');
     *         // async code to get some data
     *         callback(null, 'data', 'converted to array');
     *     },
     *     make_folder: function(callback) {
     *         console.log('in make_folder');
     *         // async code to create a directory to store a file in
     *         // this is run at the same time as getting the data
     *         callback(null, 'folder');
     *     },
     *     write_file: ['get_data', 'make_folder', function(results, callback) {
     *         console.log('in write_file', JSON.stringify(results));
     *         // once there is some data and the directory exists,
     *         // write the data to a file in the directory
     *         callback(null, 'filename');
     *     }],
     *     email_link: ['write_file', function(results, callback) {
     *         console.log('in email_link', JSON.stringify(results));
     *         // once the file is written let's email a link to it...
     *         // results.write_file contains the filename returned by write_file.
     *         callback(null, {'file':results.write_file, 'email':'user@example.com'});
     *     }]
     * }, function(err, results) {
     *     console.log('err = ', err);
     *     console.log('results = ', results);
     * });
     */
    function auto(tasks, concurrency, callback) {
        if (typeof concurrency !== 'number') {
            // concurrency is optional, shift the args.
            callback = concurrency;
            concurrency = null;
        }
        callback = once(callback || promiseCallback());
        var numTasks = Object.keys(tasks).length;
        if (!numTasks) {
            return callback(null);
        }
        if (!concurrency) {
            concurrency = numTasks;
        }

        var results = {};
        var runningTasks = 0;
        var canceled = false;
        var hasError = false;

        var listeners = Object.create(null);

        var readyTasks = [];

        // for cycle detection:
        var readyToCheck = []; // tasks that have been identified as reachable
        // without the possibility of returning to an ancestor task
        var uncheckedDependencies = {};

        Object.keys(tasks).forEach(key => {
            var task = tasks[key];
            if (!Array.isArray(task)) {
                // no dependencies
                enqueueTask(key, [task]);
                readyToCheck.push(key);
                return;
            }

            var dependencies = task.slice(0, task.length - 1);
            var remainingDependencies = dependencies.length;
            if (remainingDependencies === 0) {
                enqueueTask(key, task);
                readyToCheck.push(key);
                return;
            }
            uncheckedDependencies[key] = remainingDependencies;

            dependencies.forEach(dependencyName => {
                if (!tasks[dependencyName]) {
                    throw new Error('async.auto task `' + key +
                        '` has a non-existent dependency `' +
                        dependencyName + '` in ' +
                        dependencies.join(', '));
                }
                addListener(dependencyName, () => {
                    remainingDependencies--;
                    if (remainingDependencies === 0) {
                        enqueueTask(key, task);
                    }
                });
            });
        });

        checkForDeadlocks();
        processQueue();

        function enqueueTask(key, task) {
            readyTasks.push(() => runTask(key, task));
        }

        function processQueue() {
            if (canceled) return
            if (readyTasks.length === 0 && runningTasks === 0) {
                return callback(null, results);
            }
            while(readyTasks.length && runningTasks < concurrency) {
                var run = readyTasks.shift();
                run();
            }

        }

        function addListener(taskName, fn) {
            var taskListeners = listeners[taskName];
            if (!taskListeners) {
                taskListeners = listeners[taskName] = [];
            }

            taskListeners.push(fn);
        }

        function taskComplete(taskName) {
            var taskListeners = listeners[taskName] || [];
            taskListeners.forEach(fn => fn());
            processQueue();
        }


        function runTask(key, task) {
            if (hasError) return;

            var taskCallback = onlyOnce((err, ...result) => {
                runningTasks--;
                if (err === false) {
                    canceled = true;
                    return
                }
                if (result.length < 2) {
                    [result] = result;
                }
                if (err) {
                    var safeResults = {};
                    Object.keys(results).forEach(rkey => {
                        safeResults[rkey] = results[rkey];
                    });
                    safeResults[key] = result;
                    hasError = true;
                    listeners = Object.create(null);
                    if (canceled) return
                    callback(err, safeResults);
                } else {
                    results[key] = result;
                    taskComplete(key);
                }
            });

            runningTasks++;
            var taskFn = wrapAsync(task[task.length - 1]);
            if (task.length > 1) {
                taskFn(results, taskCallback);
            } else {
                taskFn(taskCallback);
            }
        }

        function checkForDeadlocks() {
            // Kahn's algorithm
            // https://en.wikipedia.org/wiki/Topological_sorting#Kahn.27s_algorithm
            // http://connalle.blogspot.com/2013/10/topological-sortingkahn-algorithm.html
            var currentTask;
            var counter = 0;
            while (readyToCheck.length) {
                currentTask = readyToCheck.pop();
                counter++;
                getDependents(currentTask).forEach(dependent => {
                    if (--uncheckedDependencies[dependent] === 0) {
                        readyToCheck.push(dependent);
                    }
                });
            }

            if (counter !== numTasks) {
                throw new Error(
                    'async.auto cannot execute tasks due to a recursive dependency'
                );
            }
        }

        function getDependents(taskName) {
            var result = [];
            Object.keys(tasks).forEach(key => {
                const task = tasks[key];
                if (Array.isArray(task) && task.indexOf(taskName) >= 0) {
                    result.push(key);
                }
            });
            return result;
        }

        return callback[PROMISE_SYMBOL]
    }

    var FN_ARGS = /^(?:async\s+)?(?:function)?\s*\w*\s*\(\s*([^)]+)\s*\)(?:\s*{)/;
    var ARROW_FN_ARGS = /^(?:async\s+)?\(?\s*([^)=]+)\s*\)?(?:\s*=>)/;
    var FN_ARG_SPLIT = /,/;
    var FN_ARG = /(=.+)?(\s*)$/;
    var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

    function parseParams(func) {
        const src = func.toString().replace(STRIP_COMMENTS, '');
        let match = src.match(FN_ARGS);
        if (!match) {
            match = src.match(ARROW_FN_ARGS);
        }
        if (!match) throw new Error('could not parse args in autoInject\nSource:\n' + src)
        let [, args] = match;
        return args
            .replace(/\s/g, '')
            .split(FN_ARG_SPLIT)
            .map((arg) => arg.replace(FN_ARG, '').trim());
    }

    /**
     * A dependency-injected version of the [async.auto]{@link module:ControlFlow.auto} function. Dependent
     * tasks are specified as parameters to the function, after the usual callback
     * parameter, with the parameter names matching the names of the tasks it
     * depends on. This can provide even more readable task graphs which can be
     * easier to maintain.
     *
     * If a final callback is specified, the task results are similarly injected,
     * specified as named parameters after the initial error parameter.
     *
     * The autoInject function is purely syntactic sugar and its semantics are
     * otherwise equivalent to [async.auto]{@link module:ControlFlow.auto}.
     *
     * @name autoInject
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.auto]{@link module:ControlFlow.auto}
     * @category Control Flow
     * @param {Object} tasks - An object, each of whose properties is an {@link AsyncFunction} of
     * the form 'func([dependencies...], callback). The object's key of a property
     * serves as the name of the task defined by that property, i.e. can be used
     * when specifying requirements for other tasks.
     * * The `callback` parameter is a `callback(err, result)` which must be called
     *   when finished, passing an `error` (which can be `null`) and the result of
     *   the function's execution. The remaining parameters name other tasks on
     *   which the task is dependent, and the results from those tasks are the
     *   arguments of those parameters.
     * @param {Function} [callback] - An optional callback which is called when all
     * the tasks have been completed. It receives the `err` argument if any `tasks`
     * pass an error to their callback, and a `results` object with any completed
     * task results, similar to `auto`.
     * @returns {Promise} a promise, if no callback is passed
     * @example
     *
     * //  The example from `auto` can be rewritten as follows:
     * async.autoInject({
     *     get_data: function(callback) {
     *         // async code to get some data
     *         callback(null, 'data', 'converted to array');
     *     },
     *     make_folder: function(callback) {
     *         // async code to create a directory to store a file in
     *         // this is run at the same time as getting the data
     *         callback(null, 'folder');
     *     },
     *     write_file: function(get_data, make_folder, callback) {
     *         // once there is some data and the directory exists,
     *         // write the data to a file in the directory
     *         callback(null, 'filename');
     *     },
     *     email_link: function(write_file, callback) {
     *         // once the file is written let's email a link to it...
     *         // write_file contains the filename returned by write_file.
     *         callback(null, {'file':write_file, 'email':'user@example.com'});
     *     }
     * }, function(err, results) {
     *     console.log('err = ', err);
     *     console.log('email_link = ', results.email_link);
     * });
     *
     * // If you are using a JS minifier that mangles parameter names, `autoInject`
     * // will not work with plain functions, since the parameter names will be
     * // collapsed to a single letter identifier.  To work around this, you can
     * // explicitly specify the names of the parameters your task function needs
     * // in an array, similar to Angular.js dependency injection.
     *
     * // This still has an advantage over plain `auto`, since the results a task
     * // depends on are still spread into arguments.
     * async.autoInject({
     *     //...
     *     write_file: ['get_data', 'make_folder', function(get_data, make_folder, callback) {
     *         callback(null, 'filename');
     *     }],
     *     email_link: ['write_file', function(write_file, callback) {
     *         callback(null, {'file':write_file, 'email':'user@example.com'});
     *     }]
     *     //...
     * }, function(err, results) {
     *     console.log('err = ', err);
     *     console.log('email_link = ', results.email_link);
     * });
     */
    function autoInject(tasks, callback) {
        var newTasks = {};

        Object.keys(tasks).forEach(key => {
            var taskFn = tasks[key];
            var params;
            var fnIsAsync = isAsync(taskFn);
            var hasNoDeps =
                (!fnIsAsync && taskFn.length === 1) ||
                (fnIsAsync && taskFn.length === 0);

            if (Array.isArray(taskFn)) {
                params = [...taskFn];
                taskFn = params.pop();

                newTasks[key] = params.concat(params.length > 0 ? newTask : taskFn);
            } else if (hasNoDeps) {
                // no dependencies, use the function as-is
                newTasks[key] = taskFn;
            } else {
                params = parseParams(taskFn);
                if ((taskFn.length === 0 && !fnIsAsync) && params.length === 0) {
                    throw new Error("autoInject task functions require explicit parameters.");
                }

                // remove callback param
                if (!fnIsAsync) params.pop();

                newTasks[key] = params.concat(newTask);
            }

            function newTask(results, taskCb) {
                var newArgs = params.map(name => results[name]);
                newArgs.push(taskCb);
                wrapAsync(taskFn)(...newArgs);
            }
        });

        return auto(newTasks, callback);
    }

    // Simple doubly linked list (https://en.wikipedia.org/wiki/Doubly_linked_list) implementation
    // used for queues. This implementation assumes that the node provided by the user can be modified
    // to adjust the next and last properties. We implement only the minimal functionality
    // for queue support.
    class DLL {
        constructor() {
            this.head = this.tail = null;
            this.length = 0;
        }

        removeLink(node) {
            if (node.prev) node.prev.next = node.next;
            else this.head = node.next;
            if (node.next) node.next.prev = node.prev;
            else this.tail = node.prev;

            node.prev = node.next = null;
            this.length -= 1;
            return node;
        }

        empty () {
            while(this.head) this.shift();
            return this;
        }

        insertAfter(node, newNode) {
            newNode.prev = node;
            newNode.next = node.next;
            if (node.next) node.next.prev = newNode;
            else this.tail = newNode;
            node.next = newNode;
            this.length += 1;
        }

        insertBefore(node, newNode) {
            newNode.prev = node.prev;
            newNode.next = node;
            if (node.prev) node.prev.next = newNode;
            else this.head = newNode;
            node.prev = newNode;
            this.length += 1;
        }

        unshift(node) {
            if (this.head) this.insertBefore(this.head, node);
            else setInitial(this, node);
        }

        push(node) {
            if (this.tail) this.insertAfter(this.tail, node);
            else setInitial(this, node);
        }

        shift() {
            return this.head && this.removeLink(this.head);
        }

        pop() {
            return this.tail && this.removeLink(this.tail);
        }

        toArray() {
            return [...this]
        }

        *[Symbol.iterator] () {
            var cur = this.head;
            while (cur) {
                yield cur.data;
                cur = cur.next;
            }
        }

        remove (testFn) {
            var curr = this.head;
            while(curr) {
                var {next} = curr;
                if (testFn(curr)) {
                    this.removeLink(curr);
                }
                curr = next;
            }
            return this;
        }
    }

    function setInitial(dll, node) {
        dll.length = 1;
        dll.head = dll.tail = node;
    }

    function queue(worker, concurrency, payload) {
        if (concurrency == null) {
            concurrency = 1;
        }
        else if(concurrency === 0) {
            throw new RangeError('Concurrency must not be zero');
        }

        var _worker = wrapAsync(worker);
        var numRunning = 0;
        var workersList = [];
        const events = {
            error: [],
            drain: [],
            saturated: [],
            unsaturated: [],
            empty: []
        };

        function on (event, handler) {
            events[event].push(handler);
        }

        function once (event, handler) {
            const handleAndRemove = (...args) => {
                off(event, handleAndRemove);
                handler(...args);
            };
            events[event].push(handleAndRemove);
        }

        function off (event, handler) {
            if (!event) return Object.keys(events).forEach(ev => events[ev] = [])
            if (!handler) return events[event] = []
            events[event] = events[event].filter(ev => ev !== handler);
        }

        function trigger (event, ...args) {
            events[event].forEach(handler => handler(...args));
        }

        var processingScheduled = false;
        function _insert(data, insertAtFront, rejectOnError, callback) {
            if (callback != null && typeof callback !== 'function') {
                throw new Error('task callback must be a function');
            }
            q.started = true;

            var res, rej;
            function promiseCallback (err, ...args) {
                // we don't care about the error, let the global error handler
                // deal with it
                if (err) return rejectOnError ? rej(err) : res()
                if (args.length <= 1) return res(args[0])
                res(args);
            }

            var item = {
                data,
                callback: rejectOnError ?
                    promiseCallback :
                    (callback || promiseCallback)
            };

            if (insertAtFront) {
                q._tasks.unshift(item);
            } else {
                q._tasks.push(item);
            }

            if (!processingScheduled) {
                processingScheduled = true;
                setImmediate$1(() => {
                    processingScheduled = false;
                    q.process();
                });
            }

            if (rejectOnError || !callback) {
                return new Promise((resolve, reject) => {
                    res = resolve;
                    rej = reject;
                })
            }
        }

        function _createCB(tasks) {
            return function (err, ...args) {
                numRunning -= 1;

                for (var i = 0, l = tasks.length; i < l; i++) {
                    var task = tasks[i];

                    var index = workersList.indexOf(task);
                    if (index === 0) {
                        workersList.shift();
                    } else if (index > 0) {
                        workersList.splice(index, 1);
                    }

                    task.callback(err, ...args);

                    if (err != null) {
                        trigger('error', err, task.data);
                    }
                }

                if (numRunning <= (q.concurrency - q.buffer) ) {
                    trigger('unsaturated');
                }

                if (q.idle()) {
                    trigger('drain');
                }
                q.process();
            };
        }

        function _maybeDrain(data) {
            if (data.length === 0 && q.idle()) {
                // call drain immediately if there are no tasks
                setImmediate$1(() => trigger('drain'));
                return true
            }
            return false
        }

        const eventMethod = (name) => (handler) => {
            if (!handler) {
                return new Promise((resolve, reject) => {
                    once(name, (err, data) => {
                        if (err) return reject(err)
                        resolve(data);
                    });
                })
            }
            off(name);
            on(name, handler);

        };

        var isProcessing = false;
        var q = {
            _tasks: new DLL(),
            *[Symbol.iterator] () {
                yield* q._tasks[Symbol.iterator]();
            },
            concurrency,
            payload,
            buffer: concurrency / 4,
            started: false,
            paused: false,
            push (data, callback) {
                if (Array.isArray(data)) {
                    if (_maybeDrain(data)) return
                    return data.map(datum => _insert(datum, false, false, callback))
                }
                return _insert(data, false, false, callback);
            },
            pushAsync (data, callback) {
                if (Array.isArray(data)) {
                    if (_maybeDrain(data)) return
                    return data.map(datum => _insert(datum, false, true, callback))
                }
                return _insert(data, false, true, callback);
            },
            kill () {
                off();
                q._tasks.empty();
            },
            unshift (data, callback) {
                if (Array.isArray(data)) {
                    if (_maybeDrain(data)) return
                    return data.map(datum => _insert(datum, true, false, callback))
                }
                return _insert(data, true, false, callback);
            },
            unshiftAsync (data, callback) {
                if (Array.isArray(data)) {
                    if (_maybeDrain(data)) return
                    return data.map(datum => _insert(datum, true, true, callback))
                }
                return _insert(data, true, true, callback);
            },
            remove (testFn) {
                q._tasks.remove(testFn);
            },
            process () {
                // Avoid trying to start too many processing operations. This can occur
                // when callbacks resolve synchronously (#1267).
                if (isProcessing) {
                    return;
                }
                isProcessing = true;
                while(!q.paused && numRunning < q.concurrency && q._tasks.length){
                    var tasks = [], data = [];
                    var l = q._tasks.length;
                    if (q.payload) l = Math.min(l, q.payload);
                    for (var i = 0; i < l; i++) {
                        var node = q._tasks.shift();
                        tasks.push(node);
                        workersList.push(node);
                        data.push(node.data);
                    }

                    numRunning += 1;

                    if (q._tasks.length === 0) {
                        trigger('empty');
                    }

                    if (numRunning === q.concurrency) {
                        trigger('saturated');
                    }

                    var cb = onlyOnce(_createCB(tasks));
                    _worker(data, cb);
                }
                isProcessing = false;
            },
            length () {
                return q._tasks.length;
            },
            running () {
                return numRunning;
            },
            workersList () {
                return workersList;
            },
            idle() {
                return q._tasks.length + numRunning === 0;
            },
            pause () {
                q.paused = true;
            },
            resume () {
                if (q.paused === false) { return; }
                q.paused = false;
                setImmediate$1(q.process);
            }
        };
        // define these as fixed properties, so people get useful errors when updating
        Object.defineProperties(q, {
            saturated: {
                writable: false,
                value: eventMethod('saturated')
            },
            unsaturated: {
                writable: false,
                value: eventMethod('unsaturated')
            },
            empty: {
                writable: false,
                value: eventMethod('empty')
            },
            drain: {
                writable: false,
                value: eventMethod('drain')
            },
            error: {
                writable: false,
                value: eventMethod('error')
            },
        });
        return q;
    }

    /**
     * Creates a `cargo` object with the specified payload. Tasks added to the
     * cargo will be processed altogether (up to the `payload` limit). If the
     * `worker` is in progress, the task is queued until it becomes available. Once
     * the `worker` has completed some tasks, each callback of those tasks is
     * called. Check out [these](https://camo.githubusercontent.com/6bbd36f4cf5b35a0f11a96dcd2e97711ffc2fb37/68747470733a2f2f662e636c6f75642e6769746875622e636f6d2f6173736574732f313637363837312f36383130382f62626330636662302d356632392d313165322d393734662d3333393763363464633835382e676966) [animations](https://camo.githubusercontent.com/f4810e00e1c5f5f8addbe3e9f49064fd5d102699/68747470733a2f2f662e636c6f75642e6769746875622e636f6d2f6173736574732f313637363837312f36383130312f38346339323036362d356632392d313165322d383134662d3964336430323431336266642e676966)
     * for how `cargo` and `queue` work.
     *
     * While [`queue`]{@link module:ControlFlow.queue} passes only one task to one of a group of workers
     * at a time, cargo passes an array of tasks to a single worker, repeating
     * when the worker is finished.
     *
     * @name cargo
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.queue]{@link module:ControlFlow.queue}
     * @category Control Flow
     * @param {AsyncFunction} worker - An asynchronous function for processing an array
     * of queued tasks. Invoked with `(tasks, callback)`.
     * @param {number} [payload=Infinity] - An optional `integer` for determining
     * how many tasks should be processed per round; if omitted, the default is
     * unlimited.
     * @returns {module:ControlFlow.QueueObject} A cargo object to manage the tasks. Callbacks can
     * attached as certain properties to listen for specific events during the
     * lifecycle of the cargo and inner queue.
     * @example
     *
     * // create a cargo object with payload 2
     * var cargo = async.cargo(function(tasks, callback) {
     *     for (var i=0; i<tasks.length; i++) {
     *         console.log('hello ' + tasks[i].name);
     *     }
     *     callback();
     * }, 2);
     *
     * // add some items
     * cargo.push({name: 'foo'}, function(err) {
     *     console.log('finished processing foo');
     * });
     * cargo.push({name: 'bar'}, function(err) {
     *     console.log('finished processing bar');
     * });
     * await cargo.push({name: 'baz'});
     * console.log('finished processing baz');
     */
    function cargo(worker, payload) {
        return queue(worker, 1, payload);
    }

    /**
     * Creates a `cargoQueue` object with the specified payload. Tasks added to the
     * cargoQueue will be processed together (up to the `payload` limit) in `concurrency` parallel workers.
     * If the all `workers` are in progress, the task is queued until one becomes available. Once
     * a `worker` has completed some tasks, each callback of those tasks is
     * called. Check out [these](https://camo.githubusercontent.com/6bbd36f4cf5b35a0f11a96dcd2e97711ffc2fb37/68747470733a2f2f662e636c6f75642e6769746875622e636f6d2f6173736574732f313637363837312f36383130382f62626330636662302d356632392d313165322d393734662d3333393763363464633835382e676966) [animations](https://camo.githubusercontent.com/f4810e00e1c5f5f8addbe3e9f49064fd5d102699/68747470733a2f2f662e636c6f75642e6769746875622e636f6d2f6173736574732f313637363837312f36383130312f38346339323036362d356632392d313165322d383134662d3964336430323431336266642e676966)
     * for how `cargo` and `queue` work.
     *
     * While [`queue`]{@link module:ControlFlow.queue} passes only one task to one of a group of workers
     * at a time, and [`cargo`]{@link module:ControlFlow.cargo} passes an array of tasks to a single worker,
     * the cargoQueue passes an array of tasks to multiple parallel workers.
     *
     * @name cargoQueue
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.queue]{@link module:ControlFlow.queue}
     * @see [async.cargo]{@link module:ControlFLow.cargo}
     * @category Control Flow
     * @param {AsyncFunction} worker - An asynchronous function for processing an array
     * of queued tasks. Invoked with `(tasks, callback)`.
     * @param {number} [concurrency=1] - An `integer` for determining how many
     * `worker` functions should be run in parallel.  If omitted, the concurrency
     * defaults to `1`.  If the concurrency is `0`, an error is thrown.
     * @param {number} [payload=Infinity] - An optional `integer` for determining
     * how many tasks should be processed per round; if omitted, the default is
     * unlimited.
     * @returns {module:ControlFlow.QueueObject} A cargoQueue object to manage the tasks. Callbacks can
     * attached as certain properties to listen for specific events during the
     * lifecycle of the cargoQueue and inner queue.
     * @example
     *
     * // create a cargoQueue object with payload 2 and concurrency 2
     * var cargoQueue = async.cargoQueue(function(tasks, callback) {
     *     for (var i=0; i<tasks.length; i++) {
     *         console.log('hello ' + tasks[i].name);
     *     }
     *     callback();
     * }, 2, 2);
     *
     * // add some items
     * cargoQueue.push({name: 'foo'}, function(err) {
     *     console.log('finished processing foo');
     * });
     * cargoQueue.push({name: 'bar'}, function(err) {
     *     console.log('finished processing bar');
     * });
     * cargoQueue.push({name: 'baz'}, function(err) {
     *     console.log('finished processing baz');
     * });
     * cargoQueue.push({name: 'boo'}, function(err) {
     *     console.log('finished processing boo');
     * });
     */
    function cargo$1(worker, concurrency, payload) {
        return queue(worker, concurrency, payload);
    }

    /**
     * Reduces `coll` into a single value using an async `iteratee` to return each
     * successive step. `memo` is the initial state of the reduction. This function
     * only operates in series.
     *
     * For performance reasons, it may make sense to split a call to this function
     * into a parallel map, and then use the normal `Array.prototype.reduce` on the
     * results. This function is for situations where each step in the reduction
     * needs to be async; if you can get the data before reducing it, then it's
     * probably a good idea to do so.
     *
     * @name reduce
     * @static
     * @memberOf module:Collections
     * @method
     * @alias inject
     * @alias foldl
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {*} memo - The initial state of the reduction.
     * @param {AsyncFunction} iteratee - A function applied to each item in the
     * array to produce the next step in the reduction.
     * The `iteratee` should complete with the next state of the reduction.
     * If the iteratee complete with an error, the reduction is stopped and the
     * main `callback` is immediately called with the error.
     * Invoked with (memo, item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result is the reduced value. Invoked with
     * (err, result).
     * @returns {Promise} a promise, if no callback is passed
     * @example
     *
     * async.reduce([1,2,3], 0, function(memo, item, callback) {
     *     // pointless async:
     *     process.nextTick(function() {
     *         callback(null, memo + item)
     *     });
     * }, function(err, result) {
     *     // result is now equal to the last value of memo, which is 6
     * });
     */
    function reduce(coll, memo, iteratee, callback) {
        callback = once(callback);
        var _iteratee = wrapAsync(iteratee);
        return eachOfSeries$1(coll, (x, i, iterCb) => {
            _iteratee(memo, x, (err, v) => {
                memo = v;
                iterCb(err);
            });
        }, err => callback(err, memo));
    }
    var reduce$1 = awaitify(reduce, 4);

    /**
     * Version of the compose function that is more natural to read. Each function
     * consumes the return value of the previous function. It is the equivalent of
     * [compose]{@link module:ControlFlow.compose} with the arguments reversed.
     *
     * Each function is executed with the `this` binding of the composed function.
     *
     * @name seq
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.compose]{@link module:ControlFlow.compose}
     * @category Control Flow
     * @param {...AsyncFunction} functions - the asynchronous functions to compose
     * @returns {Function} a function that composes the `functions` in order
     * @example
     *
     * // Requires lodash (or underscore), express3 and dresende's orm2.
     * // Part of an app, that fetches cats of the logged user.
     * // This example uses `seq` function to avoid overnesting and error
     * // handling clutter.
     * app.get('/cats', function(request, response) {
     *     var User = request.models.User;
     *     async.seq(
     *         _.bind(User.get, User),  // 'User.get' has signature (id, callback(err, data))
     *         function(user, fn) {
     *             user.getCats(fn);      // 'getCats' has signature (callback(err, data))
     *         }
     *     )(req.session.user_id, function (err, cats) {
     *         if (err) {
     *             console.error(err);
     *             response.json({ status: 'error', message: err.message });
     *         } else {
     *             response.json({ status: 'ok', message: 'Cats found', data: cats });
     *         }
     *     });
     * });
     */
    function seq(...functions) {
        var _functions = functions.map(wrapAsync);
        return function (...args) {
            var that = this;

            var cb = args[args.length - 1];
            if (typeof cb == 'function') {
                args.pop();
            } else {
                cb = promiseCallback();
            }

            reduce$1(_functions, args, (newargs, fn, iterCb) => {
                fn.apply(that, newargs.concat((err, ...nextargs) => {
                    iterCb(err, nextargs);
                }));
            },
            (err, results) => cb(err, ...results));

            return cb[PROMISE_SYMBOL]
        };
    }

    /**
     * Creates a function which is a composition of the passed asynchronous
     * functions. Each function consumes the return value of the function that
     * follows. Composing functions `f()`, `g()`, and `h()` would produce the result
     * of `f(g(h()))`, only this version uses callbacks to obtain the return values.
     *
     * If the last argument to the composed function is not a function, a promise
     * is returned when you call it.
     *
     * Each function is executed with the `this` binding of the composed function.
     *
     * @name compose
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {...AsyncFunction} functions - the asynchronous functions to compose
     * @returns {Function} an asynchronous function that is the composed
     * asynchronous `functions`
     * @example
     *
     * function add1(n, callback) {
     *     setTimeout(function () {
     *         callback(null, n + 1);
     *     }, 10);
     * }
     *
     * function mul3(n, callback) {
     *     setTimeout(function () {
     *         callback(null, n * 3);
     *     }, 10);
     * }
     *
     * var add1mul3 = async.compose(mul3, add1);
     * add1mul3(4, function (err, result) {
     *     // result now equals 15
     * });
     */
    function compose(...args) {
        return seq(...args.reverse());
    }

    /**
     * The same as [`map`]{@link module:Collections.map} but runs a maximum of `limit` async operations at a time.
     *
     * @name mapLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.map]{@link module:Collections.map}
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * The iteratee should complete with the transformed item.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Results is an array of the
     * transformed items from the `coll`. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback is passed
     */
    function mapLimit (coll, limit, iteratee, callback) {
        return _asyncMap(eachOfLimit(limit), coll, iteratee, callback)
    }
    var mapLimit$1 = awaitify(mapLimit, 4);

    /**
     * The same as [`concat`]{@link module:Collections.concat} but runs a maximum of `limit` async operations at a time.
     *
     * @name concatLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.concat]{@link module:Collections.concat}
     * @category Collection
     * @alias flatMapLimit
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - A function to apply to each item in `coll`,
     * which should use an array as its result. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished, or an error occurs. Results is an array
     * containing the concatenated results of the `iteratee` function. Invoked with
     * (err, results).
     * @returns A Promise, if no callback is passed
     */
    function concatLimit(coll, limit, iteratee, callback) {
        var _iteratee = wrapAsync(iteratee);
        return mapLimit$1(coll, limit, (val, iterCb) => {
            _iteratee(val, (err, ...args) => {
                if (err) return iterCb(err);
                return iterCb(err, args);
            });
        }, (err, mapResults) => {
            var result = [];
            for (var i = 0; i < mapResults.length; i++) {
                if (mapResults[i]) {
                    result = result.concat(...mapResults[i]);
                }
            }

            return callback(err, result);
        });
    }
    var concatLimit$1 = awaitify(concatLimit, 4);

    /**
     * Applies `iteratee` to each item in `coll`, concatenating the results. Returns
     * the concatenated list. The `iteratee`s are called in parallel, and the
     * results are concatenated as they return. The results array will be returned in
     * the original order of `coll` passed to the `iteratee` function.
     *
     * @name concat
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @alias flatMap
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - A function to apply to each item in `coll`,
     * which should use an array as its result. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished, or an error occurs. Results is an array
     * containing the concatenated results of the `iteratee` function. Invoked with
     * (err, results).
     * @returns A Promise, if no callback is passed
     * @example
     *
     * async.concat(['dir1','dir2','dir3'], fs.readdir, function(err, files) {
     *     // files is now a list of filenames that exist in the 3 directories
     * });
     */
    function concat(coll, iteratee, callback) {
        return concatLimit$1(coll, Infinity, iteratee, callback)
    }
    var concat$1 = awaitify(concat, 3);

    /**
     * The same as [`concat`]{@link module:Collections.concat} but runs only a single async operation at a time.
     *
     * @name concatSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.concat]{@link module:Collections.concat}
     * @category Collection
     * @alias flatMapSeries
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - A function to apply to each item in `coll`.
     * The iteratee should complete with an array an array of results.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished, or an error occurs. Results is an array
     * containing the concatenated results of the `iteratee` function. Invoked with
     * (err, results).
     * @returns A Promise, if no callback is passed
     */
    function concatSeries(coll, iteratee, callback) {
        return concatLimit$1(coll, 1, iteratee, callback)
    }
    var concatSeries$1 = awaitify(concatSeries, 3);

    /**
     * Returns a function that when called, calls-back with the values provided.
     * Useful as the first function in a [`waterfall`]{@link module:ControlFlow.waterfall}, or for plugging values in to
     * [`auto`]{@link module:ControlFlow.auto}.
     *
     * @name constant
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {...*} arguments... - Any number of arguments to automatically invoke
     * callback with.
     * @returns {AsyncFunction} Returns a function that when invoked, automatically
     * invokes the callback with the previous given arguments.
     * @example
     *
     * async.waterfall([
     *     async.constant(42),
     *     function (value, next) {
     *         // value === 42
     *     },
     *     //...
     * ], callback);
     *
     * async.waterfall([
     *     async.constant(filename, "utf8"),
     *     fs.readFile,
     *     function (fileData, next) {
     *         //...
     *     }
     *     //...
     * ], callback);
     *
     * async.auto({
     *     hostname: async.constant("https://server.net/"),
     *     port: findFreePort,
     *     launchServer: ["hostname", "port", function (options, cb) {
     *         startServer(options, cb);
     *     }],
     *     //...
     * }, callback);
     */
    function constant(...args) {
        return function (...ignoredArgs/*, callback*/) {
            var callback = ignoredArgs.pop();
            return callback(null, ...args);
        };
    }

    function _createTester(check, getResult) {
        return (eachfn, arr, _iteratee, cb) => {
            var testPassed = false;
            var testResult;
            const iteratee = wrapAsync(_iteratee);
            eachfn(arr, (value, _, callback) => {
                iteratee(value, (err, result) => {
                    if (err || err === false) return callback(err);

                    if (check(result) && !testResult) {
                        testPassed = true;
                        testResult = getResult(true, value);
                        return callback(null, breakLoop);
                    }
                    callback();
                });
            }, err => {
                if (err) return cb(err);
                cb(null, testPassed ? testResult : getResult(false));
            });
        };
    }

    /**
     * Returns the first value in `coll` that passes an async truth test. The
     * `iteratee` is applied in parallel, meaning the first iteratee to return
     * `true` will fire the detect `callback` with that result. That means the
     * result might not be the first item in the original `coll` (in terms of order)
     * that passes the test.

     * If order within the original `coll` is important, then look at
     * [`detectSeries`]{@link module:Collections.detectSeries}.
     *
     * @name detect
     * @static
     * @memberOf module:Collections
     * @method
     * @alias find
     * @category Collections
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - A truth test to apply to each item in `coll`.
     * The iteratee must complete with a boolean value as its result.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the `iteratee` functions have finished.
     * Result will be the first item in the array that passes the truth test
     * (iteratee) or the value `undefined` if none passed. Invoked with
     * (err, result).
     * @returns A Promise, if no callback is passed
     * @example
     *
     * async.detect(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, result) {
     *     // result now equals the first file in the list that exists
     * });
     */
    function detect(coll, iteratee, callback) {
        return _createTester(bool => bool, (res, item) => item)(eachOf$1, coll, iteratee, callback)
    }
    var detect$1 = awaitify(detect, 3);

    /**
     * The same as [`detect`]{@link module:Collections.detect} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name detectLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.detect]{@link module:Collections.detect}
     * @alias findLimit
     * @category Collections
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - A truth test to apply to each item in `coll`.
     * The iteratee must complete with a boolean value as its result.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the `iteratee` functions have finished.
     * Result will be the first item in the array that passes the truth test
     * (iteratee) or the value `undefined` if none passed. Invoked with
     * (err, result).
     * @returns a Promise if no callback is passed
     */
    function detectLimit(coll, limit, iteratee, callback) {
        return _createTester(bool => bool, (res, item) => item)(eachOfLimit(limit), coll, iteratee, callback)
    }
    var detectLimit$1 = awaitify(detectLimit, 4);

    /**
     * The same as [`detect`]{@link module:Collections.detect} but runs only a single async operation at a time.
     *
     * @name detectSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.detect]{@link module:Collections.detect}
     * @alias findSeries
     * @category Collections
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - A truth test to apply to each item in `coll`.
     * The iteratee must complete with a boolean value as its result.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the `iteratee` functions have finished.
     * Result will be the first item in the array that passes the truth test
     * (iteratee) or the value `undefined` if none passed. Invoked with
     * (err, result).
     * @returns a Promise if no callback is passed
     */
    function detectSeries(coll, iteratee, callback) {
        return _createTester(bool => bool, (res, item) => item)(eachOfLimit(1), coll, iteratee, callback)
    }

    var detectSeries$1 = awaitify(detectSeries, 3);

    function consoleFunc(name) {
        return (fn, ...args) => wrapAsync(fn)(...args, (err, ...resultArgs) => {
            if (typeof console === 'object') {
                if (err) {
                    if (console.error) {
                        console.error(err);
                    }
                } else if (console[name]) {
                    resultArgs.forEach(x => console[name](x));
                }
            }
        })
    }

    /**
     * Logs the result of an [`async` function]{@link AsyncFunction} to the
     * `console` using `console.dir` to display the properties of the resulting object.
     * Only works in Node.js or in browsers that support `console.dir` and
     * `console.error` (such as FF and Chrome).
     * If multiple arguments are returned from the async function,
     * `console.dir` is called on each argument in order.
     *
     * @name dir
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {AsyncFunction} function - The function you want to eventually apply
     * all arguments to.
     * @param {...*} arguments... - Any number of arguments to apply to the function.
     * @example
     *
     * // in a module
     * var hello = function(name, callback) {
     *     setTimeout(function() {
     *         callback(null, {hello: name});
     *     }, 1000);
     * };
     *
     * // in the node repl
     * node> async.dir(hello, 'world');
     * {hello: 'world'}
     */
    var dir = consoleFunc('dir');

    /**
     * The post-check version of [`whilst`]{@link module:ControlFlow.whilst}. To reflect the difference in
     * the order of operations, the arguments `test` and `iteratee` are switched.
     *
     * `doWhilst` is to `whilst` as `do while` is to `while` in plain JavaScript.
     *
     * @name doWhilst
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.whilst]{@link module:ControlFlow.whilst}
     * @category Control Flow
     * @param {AsyncFunction} iteratee - A function which is called each time `test`
     * passes. Invoked with (callback).
     * @param {AsyncFunction} test - asynchronous truth test to perform after each
     * execution of `iteratee`. Invoked with (...args, callback), where `...args` are the
     * non-error args from the previous callback of `iteratee`.
     * @param {Function} [callback] - A callback which is called after the test
     * function has failed and repeated execution of `iteratee` has stopped.
     * `callback` will be passed an error and any arguments passed to the final
     * `iteratee`'s callback. Invoked with (err, [results]);
     * @returns {Promise} a promise, if no callback is passed
     */
    function doWhilst(iteratee, test, callback) {
        callback = onlyOnce(callback);
        var _fn = wrapAsync(iteratee);
        var _test = wrapAsync(test);
        var results;

        function next(err, ...args) {
            if (err) return callback(err);
            if (err === false) return;
            results = args;
            _test(...args, check);
        }

        function check(err, truth) {
            if (err) return callback(err);
            if (err === false) return;
            if (!truth) return callback(null, ...results);
            _fn(next);
        }

        return check(null, true);
    }

    var doWhilst$1 = awaitify(doWhilst, 3);

    /**
     * Like ['doWhilst']{@link module:ControlFlow.doWhilst}, except the `test` is inverted. Note the
     * argument ordering differs from `until`.
     *
     * @name doUntil
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.doWhilst]{@link module:ControlFlow.doWhilst}
     * @category Control Flow
     * @param {AsyncFunction} iteratee - An async function which is called each time
     * `test` fails. Invoked with (callback).
     * @param {AsyncFunction} test - asynchronous truth test to perform after each
     * execution of `iteratee`. Invoked with (...args, callback), where `...args` are the
     * non-error args from the previous callback of `iteratee`
     * @param {Function} [callback] - A callback which is called after the test
     * function has passed and repeated execution of `iteratee` has stopped. `callback`
     * will be passed an error and any arguments passed to the final `iteratee`'s
     * callback. Invoked with (err, [results]);
     * @returns {Promise} a promise, if no callback is passed
     */
    function doUntil(iteratee, test, callback) {
        const _test = wrapAsync(test);
        return doWhilst$1(iteratee, (...args) => {
            const cb = args.pop();
            _test(...args, (err, truth) => cb (err, !truth));
        }, callback);
    }

    function _withoutIndex(iteratee) {
        return (value, index, callback) => iteratee(value, callback);
    }

    /**
     * Applies the function `iteratee` to each item in `coll`, in parallel.
     * The `iteratee` is called with an item from the list, and a callback for when
     * it has finished. If the `iteratee` passes an error to its `callback`, the
     * main `callback` (for the `each` function) is immediately called with the
     * error.
     *
     * Note, that since this function applies `iteratee` to each item in parallel,
     * there is no guarantee that the iteratee functions will complete in order.
     *
     * @name each
     * @static
     * @memberOf module:Collections
     * @method
     * @alias forEach
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async function to apply to
     * each item in `coll`. Invoked with (item, callback).
     * The array index is not passed to the iteratee.
     * If you need the index, use `eachOf`.
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     * @returns {Promise} a promise, if a callback is omitted
     * @example
     *
     * // assuming openFiles is an array of file names and saveFile is a function
     * // to save the modified contents of that file:
     *
     * async.each(openFiles, saveFile, function(err){
     *   // if any of the saves produced an error, err would equal that error
     * });
     *
     * // assuming openFiles is an array of file names
     * async.each(openFiles, function(file, callback) {
     *
     *     // Perform operation on file here.
     *     console.log('Processing file ' + file);
     *
     *     if( file.length > 32 ) {
     *       console.log('This file name is too long');
     *       callback('File name too long');
     *     } else {
     *       // Do work to process file here
     *       console.log('File processed');
     *       callback();
     *     }
     * }, function(err) {
     *     // if any of the file processing produced an error, err would equal that error
     *     if( err ) {
     *       // One of the iterations produced an error.
     *       // All processing will now stop.
     *       console.log('A file failed to process');
     *     } else {
     *       console.log('All files have been processed successfully');
     *     }
     * });
     */
    function eachLimit(coll, iteratee, callback) {
        return eachOf$1(coll, _withoutIndex(wrapAsync(iteratee)), callback);
    }

    var each = awaitify(eachLimit, 3);

    /**
     * The same as [`each`]{@link module:Collections.each} but runs a maximum of `limit` async operations at a time.
     *
     * @name eachLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.each]{@link module:Collections.each}
     * @alias forEachLimit
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * The array index is not passed to the iteratee.
     * If you need the index, use `eachOfLimit`.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     * @returns {Promise} a promise, if a callback is omitted
     */
    function eachLimit$1(coll, limit, iteratee, callback) {
        return eachOfLimit(limit)(coll, _withoutIndex(wrapAsync(iteratee)), callback);
    }
    var eachLimit$2 = awaitify(eachLimit$1, 4);

    /**
     * The same as [`each`]{@link module:Collections.each} but runs only a single async operation at a time.
     *
     * Note, that unlike [`each`]{@link module:Collections.each}, this function applies iteratee to each item
     * in series and therefore the iteratee functions will complete in order.

     * @name eachSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.each]{@link module:Collections.each}
     * @alias forEachSeries
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async function to apply to each
     * item in `coll`.
     * The array index is not passed to the iteratee.
     * If you need the index, use `eachOfSeries`.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called when all
     * `iteratee` functions have finished, or an error occurs. Invoked with (err).
     * @returns {Promise} a promise, if a callback is omitted
     */
    function eachSeries(coll, iteratee, callback) {
        return eachLimit$2(coll, 1, iteratee, callback)
    }
    var eachSeries$1 = awaitify(eachSeries, 3);

    /**
     * Wrap an async function and ensure it calls its callback on a later tick of
     * the event loop.  If the function already calls its callback on a next tick,
     * no extra deferral is added. This is useful for preventing stack overflows
     * (`RangeError: Maximum call stack size exceeded`) and generally keeping
     * [Zalgo](http://blog.izs.me/post/59142742143/designing-apis-for-asynchrony)
     * contained. ES2017 `async` functions are returned as-is -- they are immune
     * to Zalgo's corrupting influences, as they always resolve on a later tick.
     *
     * @name ensureAsync
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {AsyncFunction} fn - an async function, one that expects a node-style
     * callback as its last argument.
     * @returns {AsyncFunction} Returns a wrapped function with the exact same call
     * signature as the function passed in.
     * @example
     *
     * function sometimesAsync(arg, callback) {
     *     if (cache[arg]) {
     *         return callback(null, cache[arg]); // this would be synchronous!!
     *     } else {
     *         doSomeIO(arg, callback); // this IO would be asynchronous
     *     }
     * }
     *
     * // this has a risk of stack overflows if many results are cached in a row
     * async.mapSeries(args, sometimesAsync, done);
     *
     * // this will defer sometimesAsync's callback if necessary,
     * // preventing stack overflows
     * async.mapSeries(args, async.ensureAsync(sometimesAsync), done);
     */
    function ensureAsync(fn) {
        if (isAsync(fn)) return fn;
        return function (...args/*, callback*/) {
            var callback = args.pop();
            var sync = true;
            args.push((...innerArgs) => {
                if (sync) {
                    setImmediate$1(() => callback(...innerArgs));
                } else {
                    callback(...innerArgs);
                }
            });
            fn.apply(this, args);
            sync = false;
        };
    }

    /**
     * Returns `true` if every element in `coll` satisfies an async test. If any
     * iteratee call returns `false`, the main `callback` is immediately called.
     *
     * @name every
     * @static
     * @memberOf module:Collections
     * @method
     * @alias all
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async truth test to apply to each item
     * in the collection in parallel.
     * The iteratee must complete with a boolean result value.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result will be either `true` or `false`
     * depending on the values of the async tests. Invoked with (err, result).
     * @returns {Promise} a promise, if no callback provided
     * @example
     *
     * async.every(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, result) {
     *     // if result is true then every file exists
     * });
     */
    function every(coll, iteratee, callback) {
        return _createTester(bool => !bool, res => !res)(eachOf$1, coll, iteratee, callback)
    }
    var every$1 = awaitify(every, 3);

    /**
     * The same as [`every`]{@link module:Collections.every} but runs a maximum of `limit` async operations at a time.
     *
     * @name everyLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.every]{@link module:Collections.every}
     * @alias allLimit
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - An async truth test to apply to each item
     * in the collection in parallel.
     * The iteratee must complete with a boolean result value.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result will be either `true` or `false`
     * depending on the values of the async tests. Invoked with (err, result).
     * @returns {Promise} a promise, if no callback provided
     */
    function everyLimit(coll, limit, iteratee, callback) {
        return _createTester(bool => !bool, res => !res)(eachOfLimit(limit), coll, iteratee, callback)
    }
    var everyLimit$1 = awaitify(everyLimit, 4);

    /**
     * The same as [`every`]{@link module:Collections.every} but runs only a single async operation at a time.
     *
     * @name everySeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.every]{@link module:Collections.every}
     * @alias allSeries
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async truth test to apply to each item
     * in the collection in series.
     * The iteratee must complete with a boolean result value.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result will be either `true` or `false`
     * depending on the values of the async tests. Invoked with (err, result).
     * @returns {Promise} a promise, if no callback provided
     */
    function everySeries(coll, iteratee, callback) {
        return _createTester(bool => !bool, res => !res)(eachOfSeries$1, coll, iteratee, callback)
    }
    var everySeries$1 = awaitify(everySeries, 3);

    function filterArray(eachfn, arr, iteratee, callback) {
        var truthValues = new Array(arr.length);
        eachfn(arr, (x, index, iterCb) => {
            iteratee(x, (err, v) => {
                truthValues[index] = !!v;
                iterCb(err);
            });
        }, err => {
            if (err) return callback(err);
            var results = [];
            for (var i = 0; i < arr.length; i++) {
                if (truthValues[i]) results.push(arr[i]);
            }
            callback(null, results);
        });
    }

    function filterGeneric(eachfn, coll, iteratee, callback) {
        var results = [];
        eachfn(coll, (x, index, iterCb) => {
            iteratee(x, (err, v) => {
                if (err) return iterCb(err);
                if (v) {
                    results.push({index, value: x});
                }
                iterCb(err);
            });
        }, err => {
            if (err) return callback(err);
            callback(null, results
                .sort((a, b) => a.index - b.index)
                .map(v => v.value));
        });
    }

    function _filter(eachfn, coll, iteratee, callback) {
        var filter = isArrayLike(coll) ? filterArray : filterGeneric;
        return filter(eachfn, coll, wrapAsync(iteratee), callback);
    }

    /**
     * Returns a new array of all the values in `coll` which pass an async truth
     * test. This operation is performed in parallel, but the results array will be
     * in the same order as the original.
     *
     * @name filter
     * @static
     * @memberOf module:Collections
     * @method
     * @alias select
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback provided
     * @example
     *
     * async.filter(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, results) {
     *     // results now equals an array of the existing files
     * });
     */
    function filter (coll, iteratee, callback) {
        return _filter(eachOf$1, coll, iteratee, callback)
    }
    var filter$1 = awaitify(filter, 3);

    /**
     * The same as [`filter`]{@link module:Collections.filter} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name filterLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.filter]{@link module:Collections.filter}
     * @alias selectLimit
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback provided
     */
    function filterLimit (coll, limit, iteratee, callback) {
        return _filter(eachOfLimit(limit), coll, iteratee, callback)
    }
    var filterLimit$1 = awaitify(filterLimit, 4);

    /**
     * The same as [`filter`]{@link module:Collections.filter} but runs only a single async operation at a time.
     *
     * @name filterSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.filter]{@link module:Collections.filter}
     * @alias selectSeries
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - A truth test to apply to each item in `coll`.
     * The `iteratee` is passed a `callback(err, truthValue)`, which must be called
     * with a boolean argument once it has completed. Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results)
     * @returns {Promise} a promise, if no callback provided
     */
    function filterSeries (coll, iteratee, callback) {
        return _filter(eachOfSeries$1, coll, iteratee, callback)
    }
    var filterSeries$1 = awaitify(filterSeries, 3);

    /**
     * Calls the asynchronous function `fn` with a callback parameter that allows it
     * to call itself again, in series, indefinitely.

     * If an error is passed to the callback then `errback` is called with the
     * error, and execution stops, otherwise it will never be called.
     *
     * @name forever
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {AsyncFunction} fn - an async function to call repeatedly.
     * Invoked with (next).
     * @param {Function} [errback] - when `fn` passes an error to it's callback,
     * this function will be called, and execution stops. Invoked with (err).
     * @returns {Promise} a promise that rejects if an error occurs and an errback
     * is not passed
     * @example
     *
     * async.forever(
     *     function(next) {
     *         // next is suitable for passing to things that need a callback(err [, whatever]);
     *         // it will result in this function being called again.
     *     },
     *     function(err) {
     *         // if next is called with a value in its first parameter, it will appear
     *         // in here as 'err', and execution will stop.
     *     }
     * );
     */
    function forever(fn, errback) {
        var done = onlyOnce(errback);
        var task = wrapAsync(ensureAsync(fn));

        function next(err) {
            if (err) return done(err);
            if (err === false) return;
            task(next);
        }
        return next();
    }
    var forever$1 = awaitify(forever, 2);

    /**
     * The same as [`groupBy`]{@link module:Collections.groupBy} but runs a maximum of `limit` async operations at a time.
     *
     * @name groupByLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.groupBy]{@link module:Collections.groupBy}
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * The iteratee should complete with a `key` to group the value under.
     * Invoked with (value, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Result is an `Object` whoses
     * properties are arrays of values which returned the corresponding key.
     * @returns {Promise} a promise, if no callback is passed
     */
    function groupByLimit(coll, limit, iteratee, callback) {
        var _iteratee = wrapAsync(iteratee);
        return mapLimit$1(coll, limit, (val, iterCb) => {
            _iteratee(val, (err, key) => {
                if (err) return iterCb(err);
                return iterCb(err, {key, val});
            });
        }, (err, mapResults) => {
            var result = {};
            // from MDN, handle object having an `hasOwnProperty` prop
            var {hasOwnProperty} = Object.prototype;

            for (var i = 0; i < mapResults.length; i++) {
                if (mapResults[i]) {
                    var {key} = mapResults[i];
                    var {val} = mapResults[i];

                    if (hasOwnProperty.call(result, key)) {
                        result[key].push(val);
                    } else {
                        result[key] = [val];
                    }
                }
            }

            return callback(err, result);
        });
    }

    var groupByLimit$1 = awaitify(groupByLimit, 4);

    /**
     * Returns a new object, where each value corresponds to an array of items, from
     * `coll`, that returned the corresponding key. That is, the keys of the object
     * correspond to the values passed to the `iteratee` callback.
     *
     * Note: Since this function applies the `iteratee` to each item in parallel,
     * there is no guarantee that the `iteratee` functions will complete in order.
     * However, the values for each key in the `result` will be in the same order as
     * the original `coll`. For Objects, the values will roughly be in the order of
     * the original Objects' keys (but this can vary across JavaScript engines).
     *
     * @name groupBy
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * The iteratee should complete with a `key` to group the value under.
     * Invoked with (value, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Result is an `Object` whoses
     * properties are arrays of values which returned the corresponding key.
     * @returns {Promise} a promise, if no callback is passed
     * @example
     *
     * async.groupBy(['userId1', 'userId2', 'userId3'], function(userId, callback) {
     *     db.findById(userId, function(err, user) {
     *         if (err) return callback(err);
     *         return callback(null, user.age);
     *     });
     * }, function(err, result) {
     *     // result is object containing the userIds grouped by age
     *     // e.g. { 30: ['userId1', 'userId3'], 42: ['userId2']};
     * });
     */
    function groupBy (coll, iteratee, callback) {
        return groupByLimit$1(coll, Infinity, iteratee, callback)
    }

    /**
     * The same as [`groupBy`]{@link module:Collections.groupBy} but runs only a single async operation at a time.
     *
     * @name groupBySeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.groupBy]{@link module:Collections.groupBy}
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * The iteratee should complete with a `key` to group the value under.
     * Invoked with (value, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. Result is an `Object` whoses
     * properties are arrays of values which returned the corresponding key.
     * @returns {Promise} a promise, if no callback is passed
     */
    function groupBySeries (coll, iteratee, callback) {
        return groupByLimit$1(coll, 1, iteratee, callback)
    }

    /**
     * Logs the result of an `async` function to the `console`. Only works in
     * Node.js or in browsers that support `console.log` and `console.error` (such
     * as FF and Chrome). If multiple arguments are returned from the async
     * function, `console.log` is called on each argument in order.
     *
     * @name log
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {AsyncFunction} function - The function you want to eventually apply
     * all arguments to.
     * @param {...*} arguments... - Any number of arguments to apply to the function.
     * @example
     *
     * // in a module
     * var hello = function(name, callback) {
     *     setTimeout(function() {
     *         callback(null, 'hello ' + name);
     *     }, 1000);
     * };
     *
     * // in the node repl
     * node> async.log(hello, 'world');
     * 'hello world'
     */
    var log = consoleFunc('log');

    /**
     * The same as [`mapValues`]{@link module:Collections.mapValues} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name mapValuesLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.mapValues]{@link module:Collections.mapValues}
     * @category Collection
     * @param {Object} obj - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - A function to apply to each value and key
     * in `coll`.
     * The iteratee should complete with the transformed value as its result.
     * Invoked with (value, key, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. `result` is a new object consisting
     * of each key from `obj`, with each transformed value on the right-hand side.
     * Invoked with (err, result).
     * @returns {Promise} a promise, if no callback is passed
     */
    function mapValuesLimit(obj, limit, iteratee, callback) {
        callback = once(callback);
        var newObj = {};
        var _iteratee = wrapAsync(iteratee);
        return eachOfLimit(limit)(obj, (val, key, next) => {
            _iteratee(val, key, (err, result) => {
                if (err) return next(err);
                newObj[key] = result;
                next(err);
            });
        }, err => callback(err, newObj));
    }

    var mapValuesLimit$1 = awaitify(mapValuesLimit, 4);

    /**
     * A relative of [`map`]{@link module:Collections.map}, designed for use with objects.
     *
     * Produces a new Object by mapping each value of `obj` through the `iteratee`
     * function. The `iteratee` is called each `value` and `key` from `obj` and a
     * callback for when it has finished processing. Each of these callbacks takes
     * two arguments: an `error`, and the transformed item from `obj`. If `iteratee`
     * passes an error to its callback, the main `callback` (for the `mapValues`
     * function) is immediately called with the error.
     *
     * Note, the order of the keys in the result is not guaranteed.  The keys will
     * be roughly in the order they complete, (but this is very engine-specific)
     *
     * @name mapValues
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Object} obj - A collection to iterate over.
     * @param {AsyncFunction} iteratee - A function to apply to each value and key
     * in `coll`.
     * The iteratee should complete with the transformed value as its result.
     * Invoked with (value, key, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. `result` is a new object consisting
     * of each key from `obj`, with each transformed value on the right-hand side.
     * Invoked with (err, result).
     * @returns {Promise} a promise, if no callback is passed
     * @example
     *
     * async.mapValues({
     *     f1: 'file1',
     *     f2: 'file2',
     *     f3: 'file3'
     * }, function (file, key, callback) {
     *   fs.stat(file, callback);
     * }, function(err, result) {
     *     // result is now a map of stats for each file, e.g.
     *     // {
     *     //     f1: [stats for file1],
     *     //     f2: [stats for file2],
     *     //     f3: [stats for file3]
     *     // }
     * });
     */
    function mapValues(obj, iteratee, callback) {
        return mapValuesLimit$1(obj, Infinity, iteratee, callback)
    }

    /**
     * The same as [`mapValues`]{@link module:Collections.mapValues} but runs only a single async operation at a time.
     *
     * @name mapValuesSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.mapValues]{@link module:Collections.mapValues}
     * @category Collection
     * @param {Object} obj - A collection to iterate over.
     * @param {AsyncFunction} iteratee - A function to apply to each value and key
     * in `coll`.
     * The iteratee should complete with the transformed value as its result.
     * Invoked with (value, key, callback).
     * @param {Function} [callback] - A callback which is called when all `iteratee`
     * functions have finished, or an error occurs. `result` is a new object consisting
     * of each key from `obj`, with each transformed value on the right-hand side.
     * Invoked with (err, result).
     * @returns {Promise} a promise, if no callback is passed
     */
    function mapValuesSeries(obj, iteratee, callback) {
        return mapValuesLimit$1(obj, 1, iteratee, callback)
    }

    /**
     * Caches the results of an async function. When creating a hash to store
     * function results against, the callback is omitted from the hash and an
     * optional hash function can be used.
     *
     * **Note: if the async function errs, the result will not be cached and
     * subsequent calls will call the wrapped function.**
     *
     * If no hash function is specified, the first argument is used as a hash key,
     * which may work reasonably if it is a string or a data type that converts to a
     * distinct string. Note that objects and arrays will not behave reasonably.
     * Neither will cases where the other arguments are significant. In such cases,
     * specify your own hash function.
     *
     * The cache of results is exposed as the `memo` property of the function
     * returned by `memoize`.
     *
     * @name memoize
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {AsyncFunction} fn - The async function to proxy and cache results from.
     * @param {Function} hasher - An optional function for generating a custom hash
     * for storing results. It has all the arguments applied to it apart from the
     * callback, and must be synchronous.
     * @returns {AsyncFunction} a memoized version of `fn`
     * @example
     *
     * var slow_fn = function(name, callback) {
     *     // do something
     *     callback(null, result);
     * };
     * var fn = async.memoize(slow_fn);
     *
     * // fn can now be used as if it were slow_fn
     * fn('some name', function() {
     *     // callback
     * });
     */
    function memoize(fn, hasher = v => v) {
        var memo = Object.create(null);
        var queues = Object.create(null);
        var _fn = wrapAsync(fn);
        var memoized = initialParams((args, callback) => {
            var key = hasher(...args);
            if (key in memo) {
                setImmediate$1(() => callback(null, ...memo[key]));
            } else if (key in queues) {
                queues[key].push(callback);
            } else {
                queues[key] = [callback];
                _fn(...args, (err, ...resultArgs) => {
                    // #1465 don't memoize if an error occurred
                    if (!err) {
                        memo[key] = resultArgs;
                    }
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                        q[i](err, ...resultArgs);
                    }
                });
            }
        });
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    }

    /**
     * Calls `callback` on a later loop around the event loop. In Node.js this just
     * calls `process.nextTick`.  In the browser it will use `setImmediate` if
     * available, otherwise `setTimeout(callback, 0)`, which means other higher
     * priority events may precede the execution of `callback`.
     *
     * This is used internally for browser-compatibility purposes.
     *
     * @name nextTick
     * @static
     * @memberOf module:Utils
     * @method
     * @see [async.setImmediate]{@link module:Utils.setImmediate}
     * @category Util
     * @param {Function} callback - The function to call on a later loop around
     * the event loop. Invoked with (args...).
     * @param {...*} args... - any number of additional arguments to pass to the
     * callback on the next tick.
     * @example
     *
     * var call_order = [];
     * async.nextTick(function() {
     *     call_order.push('two');
     *     // call_order now equals ['one','two']
     * });
     * call_order.push('one');
     *
     * async.setImmediate(function (a, b, c) {
     *     // a, b, and c equal 1, 2, and 3
     * }, 1, 2, 3);
     */
    var _defer$1;

    if (hasNextTick) {
        _defer$1 = process.nextTick;
    } else if (hasSetImmediate) {
        _defer$1 = setImmediate;
    } else {
        _defer$1 = fallback;
    }

    var nextTick = wrap(_defer$1);

    var parallel = awaitify((eachfn, tasks, callback) => {
        var results = isArrayLike(tasks) ? [] : {};

        eachfn(tasks, (task, key, taskCb) => {
            wrapAsync(task)((err, ...result) => {
                if (result.length < 2) {
                    [result] = result;
                }
                results[key] = result;
                taskCb(err);
            });
        }, err => callback(err, results));
    }, 3);

    /**
     * Run the `tasks` collection of functions in parallel, without waiting until
     * the previous function has completed. If any of the functions pass an error to
     * its callback, the main `callback` is immediately called with the value of the
     * error. Once the `tasks` have completed, the results are passed to the final
     * `callback` as an array.
     *
     * **Note:** `parallel` is about kicking-off I/O tasks in parallel, not about
     * parallel execution of code.  If your tasks do not use any timers or perform
     * any I/O, they will actually be executed in series.  Any synchronous setup
     * sections for each task will happen one after the other.  JavaScript remains
     * single-threaded.
     *
     * **Hint:** Use [`reflect`]{@link module:Utils.reflect} to continue the
     * execution of other tasks when a task fails.
     *
     * It is also possible to use an object instead of an array. Each property will
     * be run as a function and the results will be passed to the final `callback`
     * as an object instead of an array. This can be a more readable way of handling
     * results from {@link async.parallel}.
     *
     * @name parallel
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array|Iterable|AsyncIterable|Object} tasks - A collection of
     * [async functions]{@link AsyncFunction} to run.
     * Each async function can complete with any number of optional `result` values.
     * @param {Function} [callback] - An optional callback to run once all the
     * functions have completed successfully. This function gets a results array
     * (or object) containing all the result arguments passed to the task callbacks.
     * Invoked with (err, results).
     * @returns {Promise} a promise, if a callback is not passed
     *
     * @example
     * async.parallel([
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'one');
     *         }, 200);
     *     },
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'two');
     *         }, 100);
     *     }
     * ],
     * // optional callback
     * function(err, results) {
     *     // the results array will equal ['one','two'] even though
     *     // the second function had a shorter timeout.
     * });
     *
     * // an example using an object instead of an array
     * async.parallel({
     *     one: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 1);
     *         }, 200);
     *     },
     *     two: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 2);
     *         }, 100);
     *     }
     * }, function(err, results) {
     *     // results is now equals to: {one: 1, two: 2}
     * });
     */
    function parallel$1(tasks, callback) {
        return parallel(eachOf$1, tasks, callback);
    }

    /**
     * The same as [`parallel`]{@link module:ControlFlow.parallel} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name parallelLimit
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.parallel]{@link module:ControlFlow.parallel}
     * @category Control Flow
     * @param {Array|Iterable|AsyncIterable|Object} tasks - A collection of
     * [async functions]{@link AsyncFunction} to run.
     * Each async function can complete with any number of optional `result` values.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} [callback] - An optional callback to run once all the
     * functions have completed successfully. This function gets a results array
     * (or object) containing all the result arguments passed to the task callbacks.
     * Invoked with (err, results).
     * @returns {Promise} a promise, if a callback is not passed
     */
    function parallelLimit(tasks, limit, callback) {
        return parallel(eachOfLimit(limit), tasks, callback);
    }

    /**
     * A queue of tasks for the worker function to complete.
     * @typedef {Iterable} QueueObject
     * @memberOf module:ControlFlow
     * @property {Function} length - a function returning the number of items
     * waiting to be processed. Invoke with `queue.length()`.
     * @property {boolean} started - a boolean indicating whether or not any
     * items have been pushed and processed by the queue.
     * @property {Function} running - a function returning the number of items
     * currently being processed. Invoke with `queue.running()`.
     * @property {Function} workersList - a function returning the array of items
     * currently being processed. Invoke with `queue.workersList()`.
     * @property {Function} idle - a function returning false if there are items
     * waiting or being processed, or true if not. Invoke with `queue.idle()`.
     * @property {number} concurrency - an integer for determining how many `worker`
     * functions should be run in parallel. This property can be changed after a
     * `queue` is created to alter the concurrency on-the-fly.
     * @property {number} payload - an integer that specifies how many items are
     * passed to the worker function at a time. only applies if this is a
     * [cargo]{@link module:ControlFlow.cargo} object
     * @property {AsyncFunction} push - add a new task to the `queue`. Calls `callback`
     * once the `worker` has finished processing the task. Instead of a single task,
     * a `tasks` array can be submitted. The respective callback is used for every
     * task in the list. Invoke with `queue.push(task, [callback])`,
     * @property {AsyncFunction} unshift - add a new task to the front of the `queue`.
     * Invoke with `queue.unshift(task, [callback])`.
     * @property {AsyncFunction} pushAsync - the same as `q.push`, except this returns
     * a promise that rejects if an error occurs.
     * @property {AsyncFunction} unshirtAsync - the same as `q.unshift`, except this returns
     * a promise that rejects if an error occurs.
     * @property {Function} remove - remove items from the queue that match a test
     * function.  The test function will be passed an object with a `data` property,
     * and a `priority` property, if this is a
     * [priorityQueue]{@link module:ControlFlow.priorityQueue} object.
     * Invoked with `queue.remove(testFn)`, where `testFn` is of the form
     * `function ({data, priority}) {}` and returns a Boolean.
     * @property {Function} saturated - a function that sets a callback that is
     * called when the number of running workers hits the `concurrency` limit, and
     * further tasks will be queued.  If the callback is omitted, `q.saturated()`
     * returns a promise for the next occurrence.
     * @property {Function} unsaturated - a function that sets a callback that is
     * called when the number of running workers is less than the `concurrency` &
     * `buffer` limits, and further tasks will not be queued. If the callback is
     * omitted, `q.unsaturated()` returns a promise for the next occurrence.
     * @property {number} buffer - A minimum threshold buffer in order to say that
     * the `queue` is `unsaturated`.
     * @property {Function} empty - a function that sets a callback that is called
     * when the last item from the `queue` is given to a `worker`. If the callback
     * is omitted, `q.empty()` returns a promise for the next occurrence.
     * @property {Function} drain - a function that sets a callback that is called
     * when the last item from the `queue` has returned from the `worker`. If the
     * callback is omitted, `q.drain()` returns a promise for the next occurrence.
     * @property {Function} error - a function that sets a callback that is called
     * when a task errors. Has the signature `function(error, task)`. If the
     * callback is omitted, `error()` returns a promise that rejects on the next
     * error.
     * @property {boolean} paused - a boolean for determining whether the queue is
     * in a paused state.
     * @property {Function} pause - a function that pauses the processing of tasks
     * until `resume()` is called. Invoke with `queue.pause()`.
     * @property {Function} resume - a function that resumes the processing of
     * queued tasks when the queue is paused. Invoke with `queue.resume()`.
     * @property {Function} kill - a function that removes the `drain` callback and
     * empties remaining tasks from the queue forcing it to go idle. No more tasks
     * should be pushed to the queue after calling this function. Invoke with `queue.kill()`.
     *
     * @example
     * const q = aync.queue(worker, 2)
     * q.push(item1)
     * q.push(item2)
     * q.push(item3)
     * // queues are iterable, spread into an array to inspect
     * const items = [...q] // [item1, item2, item3]
     * // or use for of
     * for (let item of q) {
     *     console.log(item)
     * }
     *
     * q.drain(() => {
     *     console.log('all done')
     * })
     * // or
     * await q.drain()
     */

    /**
     * Creates a `queue` object with the specified `concurrency`. Tasks added to the
     * `queue` are processed in parallel (up to the `concurrency` limit). If all
     * `worker`s are in progress, the task is queued until one becomes available.
     * Once a `worker` completes a `task`, that `task`'s callback is called.
     *
     * @name queue
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {AsyncFunction} worker - An async function for processing a queued task.
     * If you want to handle errors from an individual task, pass a callback to
     * `q.push()`. Invoked with (task, callback).
     * @param {number} [concurrency=1] - An `integer` for determining how many
     * `worker` functions should be run in parallel.  If omitted, the concurrency
     * defaults to `1`.  If the concurrency is `0`, an error is thrown.
     * @returns {module:ControlFlow.QueueObject} A queue object to manage the tasks. Callbacks can be
     * attached as certain properties to listen for specific events during the
     * lifecycle of the queue.
     * @example
     *
     * // create a queue object with concurrency 2
     * var q = async.queue(function(task, callback) {
     *     console.log('hello ' + task.name);
     *     callback();
     * }, 2);
     *
     * // assign a callback
     * q.drain(function() {
     *     console.log('all items have been processed');
     * });
     * // or await the end
     * await q.drain()
     *
     * // assign an error callback
     * q.error(function(err, task) {
     *     console.error('task experienced an error');
     * });
     *
     * // add some items to the queue
     * q.push({name: 'foo'}, function(err) {
     *     console.log('finished processing foo');
     * });
     * // callback is optional
     * q.push({name: 'bar'});
     *
     * // add some items to the queue (batch-wise)
     * q.push([{name: 'baz'},{name: 'bay'},{name: 'bax'}], function(err) {
     *     console.log('finished processing item');
     * });
     *
     * // add some items to the front of the queue
     * q.unshift({name: 'bar'}, function (err) {
     *     console.log('finished processing bar');
     * });
     */
    function queue$1 (worker, concurrency) {
        var _worker = wrapAsync(worker);
        return queue((items, cb) => {
            _worker(items[0], cb);
        }, concurrency, 1);
    }

    // Binary min-heap implementation used for priority queue.
    // Implementation is stable, i.e. push time is considered for equal priorities
    class Heap {
        constructor() {
            this.heap = [];
            this.pushCount = Number.MIN_SAFE_INTEGER;
        }

        get length() {
            return this.heap.length;
        }

        empty () {
            this.heap = [];
            return this;
        }

        percUp(index) {
            let p;

            while (index > 0 && smaller(this.heap[index], this.heap[p=parent(index)])) {
                let t = this.heap[index];
                this.heap[index] = this.heap[p];
                this.heap[p] = t;

                index = p;
            }
        }

        percDown(index) {
            let l;

            while ((l=leftChi(index)) < this.heap.length) {
                if (l+1 < this.heap.length && smaller(this.heap[l+1], this.heap[l])) {
                    l = l+1;
                }

                if (smaller(this.heap[index], this.heap[l])) {
                    break;
                }

                let t = this.heap[index];
                this.heap[index] = this.heap[l];
                this.heap[l] = t;

                index = l;
            }
        }

        push(node) {
            node.pushCount = ++this.pushCount;
            this.heap.push(node);
            this.percUp(this.heap.length-1);
        }

        unshift(node) {
            return this.heap.push(node);
        }

        shift() {
            let [top] = this.heap;

            this.heap[0] = this.heap[this.heap.length-1];
            this.heap.pop();
            this.percDown(0);

            return top;
        }

        toArray() {
            return [...this];
        }

        *[Symbol.iterator] () {
            for (let i = 0; i < this.heap.length; i++) {
                yield this.heap[i].data;
            }
        }

        remove (testFn) {
            let j = 0;
            for (let i = 0; i < this.heap.length; i++) {
                if (!testFn(this.heap[i])) {
                    this.heap[j] = this.heap[i];
                    j++;
                }
            }

            this.heap.splice(j);

            for (let i = parent(this.heap.length-1); i >= 0; i--) {
                this.percDown(i);
            }

            return this;
        }
    }

    function leftChi(i) {
        return (i<<1)+1;
    }

    function parent(i) {
        return ((i+1)>>1)-1;
    }

    function smaller(x, y) {
        if (x.priority !== y.priority) {
            return x.priority < y.priority;
        }
        else {
            return x.pushCount < y.pushCount;
        }
    }

    /**
     * The same as [async.queue]{@link module:ControlFlow.queue} only tasks are assigned a priority and
     * completed in ascending priority order.
     *
     * @name priorityQueue
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.queue]{@link module:ControlFlow.queue}
     * @category Control Flow
     * @param {AsyncFunction} worker - An async function for processing a queued task.
     * If you want to handle errors from an individual task, pass a callback to
     * `q.push()`.
     * Invoked with (task, callback).
     * @param {number} concurrency - An `integer` for determining how many `worker`
     * functions should be run in parallel.  If omitted, the concurrency defaults to
     * `1`.  If the concurrency is `0`, an error is thrown.
     * @returns {module:ControlFlow.QueueObject} A priorityQueue object to manage the tasks. There are two
     * differences between `queue` and `priorityQueue` objects:
     * * `push(task, priority, [callback])` - `priority` should be a number. If an
     *   array of `tasks` is given, all tasks will be assigned the same priority.
     * * The `unshift` method was removed.
     */
    function priorityQueue(worker, concurrency) {
        // Start with a normal queue
        var q = queue$1(worker, concurrency);

        q._tasks = new Heap();

        // Override push to accept second parameter representing priority
        q.push = function(data, priority = 0, callback = () => {}) {
            if (typeof callback !== 'function') {
                throw new Error('task callback must be a function');
            }
            q.started = true;
            if (!Array.isArray(data)) {
                data = [data];
            }
            if (data.length === 0 && q.idle()) {
                // call drain immediately if there are no tasks
                return setImmediate$1(() => q.drain());
            }

            for (var i = 0, l = data.length; i < l; i++) {
                var item = {
                    data: data[i],
                    priority,
                    callback
                };

                q._tasks.push(item);
            }

            setImmediate$1(q.process);
        };

        // Remove unshift function
        delete q.unshift;

        return q;
    }

    /**
     * Runs the `tasks` array of functions in parallel, without waiting until the
     * previous function has completed. Once any of the `tasks` complete or pass an
     * error to its callback, the main `callback` is immediately called. It's
     * equivalent to `Promise.race()`.
     *
     * @name race
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array} tasks - An array containing [async functions]{@link AsyncFunction}
     * to run. Each function can complete with an optional `result` value.
     * @param {Function} callback - A callback to run once any of the functions have
     * completed. This function gets an error or result from the first function that
     * completed. Invoked with (err, result).
     * @returns undefined
     * @example
     *
     * async.race([
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'one');
     *         }, 200);
     *     },
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'two');
     *         }, 100);
     *     }
     * ],
     * // main callback
     * function(err, result) {
     *     // the result will be equal to 'two' as it finishes earlier
     * });
     */
    function race(tasks, callback) {
        callback = once(callback);
        if (!Array.isArray(tasks)) return callback(new TypeError('First argument to race must be an array of functions'));
        if (!tasks.length) return callback();
        for (var i = 0, l = tasks.length; i < l; i++) {
            wrapAsync(tasks[i])(callback);
        }
    }

    var race$1 = awaitify(race, 2);

    /**
     * Same as [`reduce`]{@link module:Collections.reduce}, only operates on `array` in reverse order.
     *
     * @name reduceRight
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.reduce]{@link module:Collections.reduce}
     * @alias foldr
     * @category Collection
     * @param {Array} array - A collection to iterate over.
     * @param {*} memo - The initial state of the reduction.
     * @param {AsyncFunction} iteratee - A function applied to each item in the
     * array to produce the next step in the reduction.
     * The `iteratee` should complete with the next state of the reduction.
     * If the iteratee complete with an error, the reduction is stopped and the
     * main `callback` is immediately called with the error.
     * Invoked with (memo, item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result is the reduced value. Invoked with
     * (err, result).
     * @returns {Promise} a promise, if no callback is passed
     */
    function reduceRight (array, memo, iteratee, callback) {
        var reversed = [...array].reverse();
        return reduce$1(reversed, memo, iteratee, callback);
    }

    /**
     * Wraps the async function in another function that always completes with a
     * result object, even when it errors.
     *
     * The result object has either the property `error` or `value`.
     *
     * @name reflect
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {AsyncFunction} fn - The async function you want to wrap
     * @returns {Function} - A function that always passes null to it's callback as
     * the error. The second argument to the callback will be an `object` with
     * either an `error` or a `value` property.
     * @example
     *
     * async.parallel([
     *     async.reflect(function(callback) {
     *         // do some stuff ...
     *         callback(null, 'one');
     *     }),
     *     async.reflect(function(callback) {
     *         // do some more stuff but error ...
     *         callback('bad stuff happened');
     *     }),
     *     async.reflect(function(callback) {
     *         // do some more stuff ...
     *         callback(null, 'two');
     *     })
     * ],
     * // optional callback
     * function(err, results) {
     *     // values
     *     // results[0].value = 'one'
     *     // results[1].error = 'bad stuff happened'
     *     // results[2].value = 'two'
     * });
     */
    function reflect(fn) {
        var _fn = wrapAsync(fn);
        return initialParams(function reflectOn(args, reflectCallback) {
            args.push((error, ...cbArgs) => {
                let retVal = {};
                if (error) {
                    retVal.error = error;
                }
                if (cbArgs.length > 0){
                    var value = cbArgs;
                    if (cbArgs.length <= 1) {
                        [value] = cbArgs;
                    }
                    retVal.value = value;
                }
                reflectCallback(null, retVal);
            });

            return _fn.apply(this, args);
        });
    }

    /**
     * A helper function that wraps an array or an object of functions with `reflect`.
     *
     * @name reflectAll
     * @static
     * @memberOf module:Utils
     * @method
     * @see [async.reflect]{@link module:Utils.reflect}
     * @category Util
     * @param {Array|Object|Iterable} tasks - The collection of
     * [async functions]{@link AsyncFunction} to wrap in `async.reflect`.
     * @returns {Array} Returns an array of async functions, each wrapped in
     * `async.reflect`
     * @example
     *
     * let tasks = [
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'one');
     *         }, 200);
     *     },
     *     function(callback) {
     *         // do some more stuff but error ...
     *         callback(new Error('bad stuff happened'));
     *     },
     *     function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'two');
     *         }, 100);
     *     }
     * ];
     *
     * async.parallel(async.reflectAll(tasks),
     * // optional callback
     * function(err, results) {
     *     // values
     *     // results[0].value = 'one'
     *     // results[1].error = Error('bad stuff happened')
     *     // results[2].value = 'two'
     * });
     *
     * // an example using an object instead of an array
     * let tasks = {
     *     one: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'one');
     *         }, 200);
     *     },
     *     two: function(callback) {
     *         callback('two');
     *     },
     *     three: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 'three');
     *         }, 100);
     *     }
     * };
     *
     * async.parallel(async.reflectAll(tasks),
     * // optional callback
     * function(err, results) {
     *     // values
     *     // results.one.value = 'one'
     *     // results.two.error = 'two'
     *     // results.three.value = 'three'
     * });
     */
    function reflectAll(tasks) {
        var results;
        if (Array.isArray(tasks)) {
            results = tasks.map(reflect);
        } else {
            results = {};
            Object.keys(tasks).forEach(key => {
                results[key] = reflect.call(this, tasks[key]);
            });
        }
        return results;
    }

    function reject(eachfn, arr, _iteratee, callback) {
        const iteratee = wrapAsync(_iteratee);
        return _filter(eachfn, arr, (value, cb) => {
            iteratee(value, (err, v) => {
                cb(err, !v);
            });
        }, callback);
    }

    /**
     * The opposite of [`filter`]{@link module:Collections.filter}. Removes values that pass an `async` truth test.
     *
     * @name reject
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.filter]{@link module:Collections.filter}
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - An async truth test to apply to each item in
     * `coll`.
     * The should complete with a boolean value as its `result`.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback is passed
     * @example
     *
     * async.reject(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, results) {
     *     // results now equals an array of missing files
     *     createFiles(results);
     * });
     */
    function reject$1 (coll, iteratee, callback) {
        return reject(eachOf$1, coll, iteratee, callback)
    }
    var reject$2 = awaitify(reject$1, 3);

    /**
     * The same as [`reject`]{@link module:Collections.reject} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name rejectLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.reject]{@link module:Collections.reject}
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {Function} iteratee - An async truth test to apply to each item in
     * `coll`.
     * The should complete with a boolean value as its `result`.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback is passed
     */
    function rejectLimit (coll, limit, iteratee, callback) {
        return reject(eachOfLimit(limit), coll, iteratee, callback)
    }
    var rejectLimit$1 = awaitify(rejectLimit, 4);

    /**
     * The same as [`reject`]{@link module:Collections.reject} but runs only a single async operation at a time.
     *
     * @name rejectSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.reject]{@link module:Collections.reject}
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {Function} iteratee - An async truth test to apply to each item in
     * `coll`.
     * The should complete with a boolean value as its `result`.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback is passed
     */
    function rejectSeries (coll, iteratee, callback) {
        return reject(eachOfSeries$1, coll, iteratee, callback)
    }
    var rejectSeries$1 = awaitify(rejectSeries, 3);

    function constant$1(value) {
        return function () {
            return value;
        }
    }

    /**
     * Attempts to get a successful response from `task` no more than `times` times
     * before returning an error. If the task is successful, the `callback` will be
     * passed the result of the successful task. If all attempts fail, the callback
     * will be passed the error and result (if any) of the final attempt.
     *
     * @name retry
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @see [async.retryable]{@link module:ControlFlow.retryable}
     * @param {Object|number} [opts = {times: 5, interval: 0}| 5] - Can be either an
     * object with `times` and `interval` or a number.
     * * `times` - The number of attempts to make before giving up.  The default
     *   is `5`.
     * * `interval` - The time to wait between retries, in milliseconds.  The
     *   default is `0`. The interval may also be specified as a function of the
     *   retry count (see example).
     * * `errorFilter` - An optional synchronous function that is invoked on
     *   erroneous result. If it returns `true` the retry attempts will continue;
     *   if the function returns `false` the retry flow is aborted with the current
     *   attempt's error and result being returned to the final callback.
     *   Invoked with (err).
     * * If `opts` is a number, the number specifies the number of times to retry,
     *   with the default interval of `0`.
     * @param {AsyncFunction} task - An async function to retry.
     * Invoked with (callback).
     * @param {Function} [callback] - An optional callback which is called when the
     * task has succeeded, or after the final failed attempt. It receives the `err`
     * and `result` arguments of the last attempt at completing the `task`. Invoked
     * with (err, results).
     * @returns {Promise} a promise if no callback provided
     *
     * @example
     *
     * // The `retry` function can be used as a stand-alone control flow by passing
     * // a callback, as shown below:
     *
     * // try calling apiMethod 3 times
     * async.retry(3, apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // try calling apiMethod 3 times, waiting 200 ms between each retry
     * async.retry({times: 3, interval: 200}, apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // try calling apiMethod 10 times with exponential backoff
     * // (i.e. intervals of 100, 200, 400, 800, 1600, ... milliseconds)
     * async.retry({
     *   times: 10,
     *   interval: function(retryCount) {
     *     return 50 * Math.pow(2, retryCount);
     *   }
     * }, apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // try calling apiMethod the default 5 times no delay between each retry
     * async.retry(apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // try calling apiMethod only when error condition satisfies, all other
     * // errors will abort the retry control flow and return to final callback
     * async.retry({
     *   errorFilter: function(err) {
     *     return err.message === 'Temporary error'; // only retry on a specific error
     *   }
     * }, apiMethod, function(err, result) {
     *     // do something with the result
     * });
     *
     * // to retry individual methods that are not as reliable within other
     * // control flow functions, use the `retryable` wrapper:
     * async.auto({
     *     users: api.getUsers.bind(api),
     *     payments: async.retryable(3, api.getPayments.bind(api))
     * }, function(err, results) {
     *     // do something with the results
     * });
     *
     */
    const DEFAULT_TIMES = 5;
    const DEFAULT_INTERVAL = 0;

    function retry(opts, task, callback) {
        var options = {
            times: DEFAULT_TIMES,
            intervalFunc: constant$1(DEFAULT_INTERVAL)
        };

        if (arguments.length < 3 && typeof opts === 'function') {
            callback = task || promiseCallback();
            task = opts;
        } else {
            parseTimes(options, opts);
            callback = callback || promiseCallback();
        }

        if (typeof task !== 'function') {
            throw new Error("Invalid arguments for async.retry");
        }

        var _task = wrapAsync(task);

        var attempt = 1;
        function retryAttempt() {
            _task((err, ...args) => {
                if (err === false) return
                if (err && attempt++ < options.times &&
                    (typeof options.errorFilter != 'function' ||
                        options.errorFilter(err))) {
                    setTimeout(retryAttempt, options.intervalFunc(attempt - 1));
                } else {
                    callback(err, ...args);
                }
            });
        }

        retryAttempt();
        return callback[PROMISE_SYMBOL]
    }

    function parseTimes(acc, t) {
        if (typeof t === 'object') {
            acc.times = +t.times || DEFAULT_TIMES;

            acc.intervalFunc = typeof t.interval === 'function' ?
                t.interval :
                constant$1(+t.interval || DEFAULT_INTERVAL);

            acc.errorFilter = t.errorFilter;
        } else if (typeof t === 'number' || typeof t === 'string') {
            acc.times = +t || DEFAULT_TIMES;
        } else {
            throw new Error("Invalid arguments for async.retry");
        }
    }

    /**
     * A close relative of [`retry`]{@link module:ControlFlow.retry}.  This method
     * wraps a task and makes it retryable, rather than immediately calling it
     * with retries.
     *
     * @name retryable
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.retry]{@link module:ControlFlow.retry}
     * @category Control Flow
     * @param {Object|number} [opts = {times: 5, interval: 0}| 5] - optional
     * options, exactly the same as from `retry`, except for a `opts.arity` that
     * is the arity of the `task` function, defaulting to `task.length`
     * @param {AsyncFunction} task - the asynchronous function to wrap.
     * This function will be passed any arguments passed to the returned wrapper.
     * Invoked with (...args, callback).
     * @returns {AsyncFunction} The wrapped function, which when invoked, will
     * retry on an error, based on the parameters specified in `opts`.
     * This function will accept the same parameters as `task`.
     * @example
     *
     * async.auto({
     *     dep1: async.retryable(3, getFromFlakyService),
     *     process: ["dep1", async.retryable(3, function (results, cb) {
     *         maybeProcessData(results.dep1, cb);
     *     })]
     * }, callback);
     */
    function retryable (opts, task) {
        if (!task) {
            task = opts;
            opts = null;
        }
        let arity = (opts && opts.arity) || task.length;
        if (isAsync(task)) {
            arity += 1;
        }
        var _task = wrapAsync(task);
        return initialParams((args, callback) => {
            if (args.length < arity - 1 || callback == null) {
                args.push(callback);
                callback = promiseCallback();
            }
            function taskFn(cb) {
                _task(...args, cb);
            }

            if (opts) retry(opts, taskFn, callback);
            else retry(taskFn, callback);

            return callback[PROMISE_SYMBOL]
        });
    }

    /**
     * Run the functions in the `tasks` collection in series, each one running once
     * the previous function has completed. If any functions in the series pass an
     * error to its callback, no more functions are run, and `callback` is
     * immediately called with the value of the error. Otherwise, `callback`
     * receives an array of results when `tasks` have completed.
     *
     * It is also possible to use an object instead of an array. Each property will
     * be run as a function, and the results will be passed to the final `callback`
     * as an object instead of an array. This can be a more readable way of handling
     *  results from {@link async.series}.
     *
     * **Note** that while many implementations preserve the order of object
     * properties, the [ECMAScript Language Specification](http://www.ecma-international.org/ecma-262/5.1/#sec-8.6)
     * explicitly states that
     *
     * > The mechanics and order of enumerating the properties is not specified.
     *
     * So if you rely on the order in which your series of functions are executed,
     * and want this to work on all platforms, consider using an array.
     *
     * @name series
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array|Iterable|AsyncIterable|Object} tasks - A collection containing
     * [async functions]{@link AsyncFunction} to run in series.
     * Each function can complete with any number of optional `result` values.
     * @param {Function} [callback] - An optional callback to run once all the
     * functions have completed. This function gets a results array (or object)
     * containing all the result arguments passed to the `task` callbacks. Invoked
     * with (err, result).
     * @return {Promise} a promise, if no callback is passed
     * @example
     * async.series([
     *     function(callback) {
     *         // do some stuff ...
     *         callback(null, 'one');
     *     },
     *     function(callback) {
     *         // do some more stuff ...
     *         callback(null, 'two');
     *     }
     * ],
     * // optional callback
     * function(err, results) {
     *     // results is now equal to ['one', 'two']
     * });
     *
     * async.series({
     *     one: function(callback) {
     *         setTimeout(function() {
     *             callback(null, 1);
     *         }, 200);
     *     },
     *     two: function(callback){
     *         setTimeout(function() {
     *             callback(null, 2);
     *         }, 100);
     *     }
     * }, function(err, results) {
     *     // results is now equal to: {one: 1, two: 2}
     * });
     */
    function series(tasks, callback) {
        return parallel(eachOfSeries$1, tasks, callback);
    }

    /**
     * Returns `true` if at least one element in the `coll` satisfies an async test.
     * If any iteratee call returns `true`, the main `callback` is immediately
     * called.
     *
     * @name some
     * @static
     * @memberOf module:Collections
     * @method
     * @alias any
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async truth test to apply to each item
     * in the collections in parallel.
     * The iteratee should complete with a boolean `result` value.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the iteratee functions have finished.
     * Result will be either `true` or `false` depending on the values of the async
     * tests. Invoked with (err, result).
     * @returns {Promise} a promise, if no callback provided
     * @example
     *
     * async.some(['file1','file2','file3'], function(filePath, callback) {
     *     fs.access(filePath, function(err) {
     *         callback(null, !err)
     *     });
     * }, function(err, result) {
     *     // if result is true then at least one of the files exists
     * });
     */
    function some(coll, iteratee, callback) {
        return _createTester(Boolean, res => res)(eachOf$1, coll, iteratee, callback)
    }
    var some$1 = awaitify(some, 3);

    /**
     * The same as [`some`]{@link module:Collections.some} but runs a maximum of `limit` async operations at a time.
     *
     * @name someLimit
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.some]{@link module:Collections.some}
     * @alias anyLimit
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - An async truth test to apply to each item
     * in the collections in parallel.
     * The iteratee should complete with a boolean `result` value.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the iteratee functions have finished.
     * Result will be either `true` or `false` depending on the values of the async
     * tests. Invoked with (err, result).
     * @returns {Promise} a promise, if no callback provided
     */
    function someLimit(coll, limit, iteratee, callback) {
        return _createTester(Boolean, res => res)(eachOfLimit(limit), coll, iteratee, callback)
    }
    var someLimit$1 = awaitify(someLimit, 4);

    /**
     * The same as [`some`]{@link module:Collections.some} but runs only a single async operation at a time.
     *
     * @name someSeries
     * @static
     * @memberOf module:Collections
     * @method
     * @see [async.some]{@link module:Collections.some}
     * @alias anySeries
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async truth test to apply to each item
     * in the collections in series.
     * The iteratee should complete with a boolean `result` value.
     * Invoked with (item, callback).
     * @param {Function} [callback] - A callback which is called as soon as any
     * iteratee returns `true`, or after all the iteratee functions have finished.
     * Result will be either `true` or `false` depending on the values of the async
     * tests. Invoked with (err, result).
     * @returns {Promise} a promise, if no callback provided
     */
    function someSeries(coll, iteratee, callback) {
        return _createTester(Boolean, res => res)(eachOfSeries$1, coll, iteratee, callback)
    }
    var someSeries$1 = awaitify(someSeries, 3);

    /**
     * Sorts a list by the results of running each `coll` value through an async
     * `iteratee`.
     *
     * @name sortBy
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {AsyncFunction} iteratee - An async function to apply to each item in
     * `coll`.
     * The iteratee should complete with a value to use as the sort criteria as
     * its `result`.
     * Invoked with (item, callback).
     * @param {Function} callback - A callback which is called after all the
     * `iteratee` functions have finished, or an error occurs. Results is the items
     * from the original `coll` sorted by the values returned by the `iteratee`
     * calls. Invoked with (err, results).
     * @returns {Promise} a promise, if no callback passed
     * @example
     *
     * async.sortBy(['file1','file2','file3'], function(file, callback) {
     *     fs.stat(file, function(err, stats) {
     *         callback(err, stats.mtime);
     *     });
     * }, function(err, results) {
     *     // results is now the original array of files sorted by
     *     // modified date
     * });
     *
     * // By modifying the callback parameter the
     * // sorting order can be influenced:
     *
     * // ascending order
     * async.sortBy([1,9,3,5], function(x, callback) {
     *     callback(null, x);
     * }, function(err,result) {
     *     // result callback
     * });
     *
     * // descending order
     * async.sortBy([1,9,3,5], function(x, callback) {
     *     callback(null, x*-1);    //<- x*-1 instead of x, turns the order around
     * }, function(err,result) {
     *     // result callback
     * });
     */
    function sortBy (coll, iteratee, callback) {
        var _iteratee = wrapAsync(iteratee);
        return map$1(coll, (x, iterCb) => {
            _iteratee(x, (err, criteria) => {
                if (err) return iterCb(err);
                iterCb(err, {value: x, criteria});
            });
        }, (err, results) => {
            if (err) return callback(err);
            callback(null, results.sort(comparator).map(v => v.value));
        });

        function comparator(left, right) {
            var a = left.criteria, b = right.criteria;
            return a < b ? -1 : a > b ? 1 : 0;
        }
    }
    var sortBy$1 = awaitify(sortBy, 3);

    /**
     * Sets a time limit on an asynchronous function. If the function does not call
     * its callback within the specified milliseconds, it will be called with a
     * timeout error. The code property for the error object will be `'ETIMEDOUT'`.
     *
     * @name timeout
     * @static
     * @memberOf module:Utils
     * @method
     * @category Util
     * @param {AsyncFunction} asyncFn - The async function to limit in time.
     * @param {number} milliseconds - The specified time limit.
     * @param {*} [info] - Any variable you want attached (`string`, `object`, etc)
     * to timeout Error for more information..
     * @returns {AsyncFunction} Returns a wrapped function that can be used with any
     * of the control flow functions.
     * Invoke this function with the same parameters as you would `asyncFunc`.
     * @example
     *
     * function myFunction(foo, callback) {
     *     doAsyncTask(foo, function(err, data) {
     *         // handle errors
     *         if (err) return callback(err);
     *
     *         // do some stuff ...
     *
     *         // return processed data
     *         return callback(null, data);
     *     });
     * }
     *
     * var wrapped = async.timeout(myFunction, 1000);
     *
     * // call `wrapped` as you would `myFunction`
     * wrapped({ bar: 'bar' }, function(err, data) {
     *     // if `myFunction` takes < 1000 ms to execute, `err`
     *     // and `data` will have their expected values
     *
     *     // else `err` will be an Error with the code 'ETIMEDOUT'
     * });
     */
    function timeout(asyncFn, milliseconds, info) {
        var fn = wrapAsync(asyncFn);

        return initialParams((args, callback) => {
            var timedOut = false;
            var timer;

            function timeoutCallback() {
                var name = asyncFn.name || 'anonymous';
                var error  = new Error('Callback function "' + name + '" timed out.');
                error.code = 'ETIMEDOUT';
                if (info) {
                    error.info = info;
                }
                timedOut = true;
                callback(error);
            }

            args.push((...cbArgs) => {
                if (!timedOut) {
                    callback(...cbArgs);
                    clearTimeout(timer);
                }
            });

            // setup timer and call original function
            timer = setTimeout(timeoutCallback, milliseconds);
            fn(...args);
        });
    }

    function range(size) {
        var result = Array(size);
        while (size--) {
            result[size] = size;
        }
        return result;
    }

    /**
     * The same as [times]{@link module:ControlFlow.times} but runs a maximum of `limit` async operations at a
     * time.
     *
     * @name timesLimit
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.times]{@link module:ControlFlow.times}
     * @category Control Flow
     * @param {number} count - The number of times to run the function.
     * @param {number} limit - The maximum number of async operations at a time.
     * @param {AsyncFunction} iteratee - The async function to call `n` times.
     * Invoked with the iteration index and a callback: (n, next).
     * @param {Function} callback - see [async.map]{@link module:Collections.map}.
     * @returns {Promise} a promise, if no callback is provided
     */
    function timesLimit(count, limit, iteratee, callback) {
        var _iteratee = wrapAsync(iteratee);
        return mapLimit$1(range(count), limit, _iteratee, callback);
    }

    /**
     * Calls the `iteratee` function `n` times, and accumulates results in the same
     * manner you would use with [map]{@link module:Collections.map}.
     *
     * @name times
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.map]{@link module:Collections.map}
     * @category Control Flow
     * @param {number} n - The number of times to run the function.
     * @param {AsyncFunction} iteratee - The async function to call `n` times.
     * Invoked with the iteration index and a callback: (n, next).
     * @param {Function} callback - see {@link module:Collections.map}.
     * @returns {Promise} a promise, if no callback is provided
     * @example
     *
     * // Pretend this is some complicated async factory
     * var createUser = function(id, callback) {
     *     callback(null, {
     *         id: 'user' + id
     *     });
     * };
     *
     * // generate 5 users
     * async.times(5, function(n, next) {
     *     createUser(n, function(err, user) {
     *         next(err, user);
     *     });
     * }, function(err, users) {
     *     // we should now have 5 users
     * });
     */
    function times (n, iteratee, callback) {
        return timesLimit(n, Infinity, iteratee, callback)
    }

    /**
     * The same as [times]{@link module:ControlFlow.times} but runs only a single async operation at a time.
     *
     * @name timesSeries
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.times]{@link module:ControlFlow.times}
     * @category Control Flow
     * @param {number} n - The number of times to run the function.
     * @param {AsyncFunction} iteratee - The async function to call `n` times.
     * Invoked with the iteration index and a callback: (n, next).
     * @param {Function} callback - see {@link module:Collections.map}.
     * @returns {Promise} a promise, if no callback is provided
     */
    function timesSeries (n, iteratee, callback) {
        return timesLimit(n, 1, iteratee, callback)
    }

    /**
     * A relative of `reduce`.  Takes an Object or Array, and iterates over each
     * element in parallel, each step potentially mutating an `accumulator` value.
     * The type of the accumulator defaults to the type of collection passed in.
     *
     * @name transform
     * @static
     * @memberOf module:Collections
     * @method
     * @category Collection
     * @param {Array|Iterable|AsyncIterable|Object} coll - A collection to iterate over.
     * @param {*} [accumulator] - The initial state of the transform.  If omitted,
     * it will default to an empty Object or Array, depending on the type of `coll`
     * @param {AsyncFunction} iteratee - A function applied to each item in the
     * collection that potentially modifies the accumulator.
     * Invoked with (accumulator, item, key, callback).
     * @param {Function} [callback] - A callback which is called after all the
     * `iteratee` functions have finished. Result is the transformed accumulator.
     * Invoked with (err, result).
     * @returns {Promise} a promise, if no callback provided
     * @example
     *
     * async.transform([1,2,3], function(acc, item, index, callback) {
     *     // pointless async:
     *     process.nextTick(function() {
     *         acc[index] = item * 2
     *         callback(null)
     *     });
     * }, function(err, result) {
     *     // result is now equal to [2, 4, 6]
     * });
     *
     * @example
     *
     * async.transform({a: 1, b: 2, c: 3}, function (obj, val, key, callback) {
     *     setImmediate(function () {
     *         obj[key] = val * 2;
     *         callback();
     *     })
     * }, function (err, result) {
     *     // result is equal to {a: 2, b: 4, c: 6}
     * })
     */
    function transform (coll, accumulator, iteratee, callback) {
        if (arguments.length <= 3 && typeof accumulator === 'function') {
            callback = iteratee;
            iteratee = accumulator;
            accumulator = Array.isArray(coll) ? [] : {};
        }
        callback = once(callback || promiseCallback());
        var _iteratee = wrapAsync(iteratee);

        eachOf$1(coll, (v, k, cb) => {
            _iteratee(accumulator, v, k, cb);
        }, err => callback(err, accumulator));
        return callback[PROMISE_SYMBOL]
    }

    /**
     * It runs each task in series but stops whenever any of the functions were
     * successful. If one of the tasks were successful, the `callback` will be
     * passed the result of the successful task. If all tasks fail, the callback
     * will be passed the error and result (if any) of the final attempt.
     *
     * @name tryEach
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array|Iterable|AsyncIterable|Object} tasks - A collection containing functions to
     * run, each function is passed a `callback(err, result)` it must call on
     * completion with an error `err` (which can be `null`) and an optional `result`
     * value.
     * @param {Function} [callback] - An optional callback which is called when one
     * of the tasks has succeeded, or all have failed. It receives the `err` and
     * `result` arguments of the last attempt at completing the `task`. Invoked with
     * (err, results).
     * @returns {Promise} a promise, if no callback is passed
     * @example
     * async.tryEach([
     *     function getDataFromFirstWebsite(callback) {
     *         // Try getting the data from the first website
     *         callback(err, data);
     *     },
     *     function getDataFromSecondWebsite(callback) {
     *         // First website failed,
     *         // Try getting the data from the backup website
     *         callback(err, data);
     *     }
     * ],
     * // optional callback
     * function(err, results) {
     *     Now do something with the data.
     * });
     *
     */
    function tryEach(tasks, callback) {
        var error = null;
        var result;
        return eachSeries$1(tasks, (task, taskCb) => {
            wrapAsync(task)((err, ...args) => {
                if (err === false) return taskCb(err);

                if (args.length < 2) {
                    [result] = args;
                } else {
                    result = args;
                }
                error = err;
                taskCb(err ? null : {});
            });
        }, () => callback(error, result));
    }

    var tryEach$1 = awaitify(tryEach);

    /**
     * Undoes a [memoize]{@link module:Utils.memoize}d function, reverting it to the original,
     * unmemoized form. Handy for testing.
     *
     * @name unmemoize
     * @static
     * @memberOf module:Utils
     * @method
     * @see [async.memoize]{@link module:Utils.memoize}
     * @category Util
     * @param {AsyncFunction} fn - the memoized function
     * @returns {AsyncFunction} a function that calls the original unmemoized function
     */
    function unmemoize(fn) {
        return (...args) => {
            return (fn.unmemoized || fn)(...args);
        };
    }

    /**
     * Repeatedly call `iteratee`, while `test` returns `true`. Calls `callback` when
     * stopped, or an error occurs.
     *
     * @name whilst
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {AsyncFunction} test - asynchronous truth test to perform before each
     * execution of `iteratee`. Invoked with ().
     * @param {AsyncFunction} iteratee - An async function which is called each time
     * `test` passes. Invoked with (callback).
     * @param {Function} [callback] - A callback which is called after the test
     * function has failed and repeated execution of `iteratee` has stopped. `callback`
     * will be passed an error and any arguments passed to the final `iteratee`'s
     * callback. Invoked with (err, [results]);
     * @returns {Promise} a promise, if no callback is passed
     * @example
     *
     * var count = 0;
     * async.whilst(
     *     function test(cb) { cb(null, count < 5); },
     *     function iter(callback) {
     *         count++;
     *         setTimeout(function() {
     *             callback(null, count);
     *         }, 1000);
     *     },
     *     function (err, n) {
     *         // 5 seconds have passed, n = 5
     *     }
     * );
     */
    function whilst(test, iteratee, callback) {
        callback = onlyOnce(callback);
        var _fn = wrapAsync(iteratee);
        var _test = wrapAsync(test);
        var results = [];

        function next(err, ...rest) {
            if (err) return callback(err);
            results = rest;
            if (err === false) return;
            _test(check);
        }

        function check(err, truth) {
            if (err) return callback(err);
            if (err === false) return;
            if (!truth) return callback(null, ...results);
            _fn(next);
        }

        return _test(check);
    }
    var whilst$1 = awaitify(whilst, 3);

    /**
     * Repeatedly call `iteratee` until `test` returns `true`. Calls `callback` when
     * stopped, or an error occurs. `callback` will be passed an error and any
     * arguments passed to the final `iteratee`'s callback.
     *
     * The inverse of [whilst]{@link module:ControlFlow.whilst}.
     *
     * @name until
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @see [async.whilst]{@link module:ControlFlow.whilst}
     * @category Control Flow
     * @param {AsyncFunction} test - asynchronous truth test to perform before each
     * execution of `iteratee`. Invoked with (callback).
     * @param {AsyncFunction} iteratee - An async function which is called each time
     * `test` fails. Invoked with (callback).
     * @param {Function} [callback] - A callback which is called after the test
     * function has passed and repeated execution of `iteratee` has stopped. `callback`
     * will be passed an error and any arguments passed to the final `iteratee`'s
     * callback. Invoked with (err, [results]);
     * @returns {Promise} a promise, if a callback is not passed
     *
     * @example
     * const results = []
     * let finished = false
     * async.until(function test(page, cb) {
     *     cb(null, finished)
     * }, function iter(next) {
     *     fetchPage(url, (err, body) => {
     *         if (err) return next(err)
     *         results = results.concat(body.objects)
     *         finished = !!body.next
     *         next(err)
     *     })
     * }, function done (err) {
     *     // all pages have been fetched
     * })
     */
    function until(test, iteratee, callback) {
        const _test = wrapAsync(test);
        return whilst$1((cb) => _test((err, truth) => cb (err, !truth)), iteratee, callback);
    }

    /**
     * Runs the `tasks` array of functions in series, each passing their results to
     * the next in the array. However, if any of the `tasks` pass an error to their
     * own callback, the next function is not executed, and the main `callback` is
     * immediately called with the error.
     *
     * @name waterfall
     * @static
     * @memberOf module:ControlFlow
     * @method
     * @category Control Flow
     * @param {Array} tasks - An array of [async functions]{@link AsyncFunction}
     * to run.
     * Each function should complete with any number of `result` values.
     * The `result` values will be passed as arguments, in order, to the next task.
     * @param {Function} [callback] - An optional callback to run once all the
     * functions have completed. This will be passed the results of the last task's
     * callback. Invoked with (err, [results]).
     * @returns undefined
     * @example
     *
     * async.waterfall([
     *     function(callback) {
     *         callback(null, 'one', 'two');
     *     },
     *     function(arg1, arg2, callback) {
     *         // arg1 now equals 'one' and arg2 now equals 'two'
     *         callback(null, 'three');
     *     },
     *     function(arg1, callback) {
     *         // arg1 now equals 'three'
     *         callback(null, 'done');
     *     }
     * ], function (err, result) {
     *     // result now equals 'done'
     * });
     *
     * // Or, with named functions:
     * async.waterfall([
     *     myFirstFunction,
     *     mySecondFunction,
     *     myLastFunction,
     * ], function (err, result) {
     *     // result now equals 'done'
     * });
     * function myFirstFunction(callback) {
     *     callback(null, 'one', 'two');
     * }
     * function mySecondFunction(arg1, arg2, callback) {
     *     // arg1 now equals 'one' and arg2 now equals 'two'
     *     callback(null, 'three');
     * }
     * function myLastFunction(arg1, callback) {
     *     // arg1 now equals 'three'
     *     callback(null, 'done');
     * }
     */
    function waterfall (tasks, callback) {
        callback = once(callback);
        if (!Array.isArray(tasks)) return callback(new Error('First argument to waterfall must be an array of functions'));
        if (!tasks.length) return callback();
        var taskIndex = 0;

        function nextTask(args) {
            var task = wrapAsync(tasks[taskIndex++]);
            task(...args, onlyOnce(next));
        }

        function next(err, ...args) {
            if (err === false) return
            if (err || taskIndex === tasks.length) {
                return callback(err, ...args);
            }
            nextTask(args);
        }

        nextTask([]);
    }

    var waterfall$1 = awaitify(waterfall);

    /**
     * An "async function" in the context of Async is an asynchronous function with
     * a variable number of parameters, with the final parameter being a callback.
     * (`function (arg1, arg2, ..., callback) {}`)
     * The final callback is of the form `callback(err, results...)`, which must be
     * called once the function is completed.  The callback should be called with a
     * Error as its first argument to signal that an error occurred.
     * Otherwise, if no error occurred, it should be called with `null` as the first
     * argument, and any additional `result` arguments that may apply, to signal
     * successful completion.
     * The callback must be called exactly once, ideally on a later tick of the
     * JavaScript event loop.
     *
     * This type of function is also referred to as a "Node-style async function",
     * or a "continuation passing-style function" (CPS). Most of the methods of this
     * library are themselves CPS/Node-style async functions, or functions that
     * return CPS/Node-style async functions.
     *
     * Wherever we accept a Node-style async function, we also directly accept an
     * [ES2017 `async` function]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function}.
     * In this case, the `async` function will not be passed a final callback
     * argument, and any thrown error will be used as the `err` argument of the
     * implicit callback, and the return value will be used as the `result` value.
     * (i.e. a `rejected` of the returned Promise becomes the `err` callback
     * argument, and a `resolved` value becomes the `result`.)
     *
     * Note, due to JavaScript limitations, we can only detect native `async`
     * functions and not transpilied implementations.
     * Your environment must have `async`/`await` support for this to work.
     * (e.g. Node > v7.6, or a recent version of a modern browser).
     * If you are using `async` functions through a transpiler (e.g. Babel), you
     * must still wrap the function with [asyncify]{@link module:Utils.asyncify},
     * because the `async function` will be compiled to an ordinary function that
     * returns a promise.
     *
     * @typedef {Function} AsyncFunction
     * @static
     */

    var index = {
        apply,
        applyEach: applyEach$1,
        applyEachSeries,
        asyncify,
        auto,
        autoInject,
        cargo,
        cargoQueue: cargo$1,
        compose,
        concat: concat$1,
        concatLimit: concatLimit$1,
        concatSeries: concatSeries$1,
        constant,
        detect: detect$1,
        detectLimit: detectLimit$1,
        detectSeries: detectSeries$1,
        dir,
        doUntil,
        doWhilst: doWhilst$1,
        each,
        eachLimit: eachLimit$2,
        eachOf: eachOf$1,
        eachOfLimit: eachOfLimit$2,
        eachOfSeries: eachOfSeries$1,
        eachSeries: eachSeries$1,
        ensureAsync,
        every: every$1,
        everyLimit: everyLimit$1,
        everySeries: everySeries$1,
        filter: filter$1,
        filterLimit: filterLimit$1,
        filterSeries: filterSeries$1,
        forever: forever$1,
        groupBy,
        groupByLimit: groupByLimit$1,
        groupBySeries,
        log,
        map: map$1,
        mapLimit: mapLimit$1,
        mapSeries: mapSeries$1,
        mapValues,
        mapValuesLimit: mapValuesLimit$1,
        mapValuesSeries,
        memoize,
        nextTick,
        parallel: parallel$1,
        parallelLimit,
        priorityQueue,
        queue: queue$1,
        race: race$1,
        reduce: reduce$1,
        reduceRight,
        reflect,
        reflectAll,
        reject: reject$2,
        rejectLimit: rejectLimit$1,
        rejectSeries: rejectSeries$1,
        retry,
        retryable,
        seq,
        series,
        setImmediate: setImmediate$1,
        some: some$1,
        someLimit: someLimit$1,
        someSeries: someSeries$1,
        sortBy: sortBy$1,
        timeout,
        times,
        timesLimit,
        timesSeries,
        transform,
        tryEach: tryEach$1,
        unmemoize,
        until,
        waterfall: waterfall$1,
        whilst: whilst$1,

        // aliases
        all: every$1,
        allLimit: everyLimit$1,
        allSeries: everySeries$1,
        any: some$1,
        anyLimit: someLimit$1,
        anySeries: someSeries$1,
        find: detect$1,
        findLimit: detectLimit$1,
        findSeries: detectSeries$1,
        flatMap: concat$1,
        flatMapLimit: concatLimit$1,
        flatMapSeries: concatSeries$1,
        forEach: each,
        forEachSeries: eachSeries$1,
        forEachLimit: eachLimit$2,
        forEachOf: eachOf$1,
        forEachOfSeries: eachOfSeries$1,
        forEachOfLimit: eachOfLimit$2,
        inject: reduce$1,
        foldl: reduce$1,
        foldr: reduceRight,
        select: filter$1,
        selectLimit: filterLimit$1,
        selectSeries: filterSeries$1,
        wrapSync: asyncify,
        during: whilst$1,
        doDuring: doWhilst$1
    };

    exports.default = index;
    exports.apply = apply;
    exports.applyEach = applyEach$1;
    exports.applyEachSeries = applyEachSeries;
    exports.asyncify = asyncify;
    exports.auto = auto;
    exports.autoInject = autoInject;
    exports.cargo = cargo;
    exports.cargoQueue = cargo$1;
    exports.compose = compose;
    exports.concat = concat$1;
    exports.concatLimit = concatLimit$1;
    exports.concatSeries = concatSeries$1;
    exports.constant = constant;
    exports.detect = detect$1;
    exports.detectLimit = detectLimit$1;
    exports.detectSeries = detectSeries$1;
    exports.dir = dir;
    exports.doUntil = doUntil;
    exports.doWhilst = doWhilst$1;
    exports.each = each;
    exports.eachLimit = eachLimit$2;
    exports.eachOf = eachOf$1;
    exports.eachOfLimit = eachOfLimit$2;
    exports.eachOfSeries = eachOfSeries$1;
    exports.eachSeries = eachSeries$1;
    exports.ensureAsync = ensureAsync;
    exports.every = every$1;
    exports.everyLimit = everyLimit$1;
    exports.everySeries = everySeries$1;
    exports.filter = filter$1;
    exports.filterLimit = filterLimit$1;
    exports.filterSeries = filterSeries$1;
    exports.forever = forever$1;
    exports.groupBy = groupBy;
    exports.groupByLimit = groupByLimit$1;
    exports.groupBySeries = groupBySeries;
    exports.log = log;
    exports.map = map$1;
    exports.mapLimit = mapLimit$1;
    exports.mapSeries = mapSeries$1;
    exports.mapValues = mapValues;
    exports.mapValuesLimit = mapValuesLimit$1;
    exports.mapValuesSeries = mapValuesSeries;
    exports.memoize = memoize;
    exports.nextTick = nextTick;
    exports.parallel = parallel$1;
    exports.parallelLimit = parallelLimit;
    exports.priorityQueue = priorityQueue;
    exports.queue = queue$1;
    exports.race = race$1;
    exports.reduce = reduce$1;
    exports.reduceRight = reduceRight;
    exports.reflect = reflect;
    exports.reflectAll = reflectAll;
    exports.reject = reject$2;
    exports.rejectLimit = rejectLimit$1;
    exports.rejectSeries = rejectSeries$1;
    exports.retry = retry;
    exports.retryable = retryable;
    exports.seq = seq;
    exports.series = series;
    exports.setImmediate = setImmediate$1;
    exports.some = some$1;
    exports.someLimit = someLimit$1;
    exports.someSeries = someSeries$1;
    exports.sortBy = sortBy$1;
    exports.timeout = timeout;
    exports.times = times;
    exports.timesLimit = timesLimit;
    exports.timesSeries = timesSeries;
    exports.transform = transform;
    exports.tryEach = tryEach$1;
    exports.unmemoize = unmemoize;
    exports.until = until;
    exports.waterfall = waterfall$1;
    exports.whilst = whilst$1;
    exports.all = every$1;
    exports.allLimit = everyLimit$1;
    exports.allSeries = everySeries$1;
    exports.any = some$1;
    exports.anyLimit = someLimit$1;
    exports.anySeries = someSeries$1;
    exports.find = detect$1;
    exports.findLimit = detectLimit$1;
    exports.findSeries = detectSeries$1;
    exports.flatMap = concat$1;
    exports.flatMapLimit = concatLimit$1;
    exports.flatMapSeries = concatSeries$1;
    exports.forEach = each;
    exports.forEachSeries = eachSeries$1;
    exports.forEachLimit = eachLimit$2;
    exports.forEachOf = eachOf$1;
    exports.forEachOfSeries = eachOfSeries$1;
    exports.forEachOfLimit = eachOfLimit$2;
    exports.inject = reduce$1;
    exports.foldl = reduce$1;
    exports.foldr = reduceRight;
    exports.select = filter$1;
    exports.selectLimit = filterLimit$1;
    exports.selectSeries = filterSeries$1;
    exports.wrapSync = asyncify;
    exports.during = whilst$1;
    exports.doDuring = doWhilst$1;

    Object.defineProperty(exports, '__esModule', { value: true });

})));

}).call(this)}).call(this,require('_process'),require("timers").setImmediate)
},{"_process":23,"timers":36}],4:[function(require,module,exports){
(function (global){(function (){
'use strict';

var filter = require('array-filter');

module.exports = function availableTypedArrays() {
	return filter([
		'BigInt64Array',
		'BigUint64Array',
		'Float32Array',
		'Float64Array',
		'Int16Array',
		'Int32Array',
		'Int8Array',
		'Uint16Array',
		'Uint32Array',
		'Uint8Array',
		'Uint8ClampedArray'
	], function (typedArray) {
		return typeof global[typedArray] === 'function';
	});
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"array-filter":2}],5:[function(require,module,exports){

},{}],6:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');

var callBind = require('./');

var $indexOf = callBind(GetIntrinsic('String.prototype.indexOf'));

module.exports = function callBoundIntrinsic(name, allowMissing) {
	var intrinsic = GetIntrinsic(name, !!allowMissing);
	if (typeof intrinsic === 'function' && $indexOf(name, '.prototype.') > -1) {
		return callBind(intrinsic);
	}
	return intrinsic;
};

},{"./":7,"get-intrinsic":14}],7:[function(require,module,exports){
'use strict';

var bind = require('function-bind');
var GetIntrinsic = require('get-intrinsic');

var $apply = GetIntrinsic('%Function.prototype.apply%');
var $call = GetIntrinsic('%Function.prototype.call%');
var $reflectApply = GetIntrinsic('%Reflect.apply%', true) || bind.call($call, $apply);

var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%', true);
var $defineProperty = GetIntrinsic('%Object.defineProperty%', true);
var $max = GetIntrinsic('%Math.max%');

if ($defineProperty) {
	try {
		$defineProperty({}, 'a', { value: 1 });
	} catch (e) {
		// IE 8 has a broken defineProperty
		$defineProperty = null;
	}
}

module.exports = function callBind(originalFunction) {
	var func = $reflectApply(bind, $call, arguments);
	if ($gOPD && $defineProperty) {
		var desc = $gOPD(func, 'length');
		if (desc.configurable) {
			// original length, plus the receiver, minus any additional arguments (after the receiver)
			$defineProperty(
				func,
				'length',
				{ value: 1 + $max(0, originalFunction.length - (arguments.length - 1)) }
			);
		}
	}
	return func;
};

var applyBind = function applyBind() {
	return $reflectApply(bind, $apply, arguments);
};

if ($defineProperty) {
	$defineProperty(module.exports, 'apply', { value: applyBind });
} else {
	module.exports.apply = applyBind;
}

},{"function-bind":13,"get-intrinsic":14}],8:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

if (typeof module !== 'undefined') {
  module.exports = Emitter;
}

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks['$' + event] = this._callbacks['$' + event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  function on() {
    this.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks['$' + event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks['$' + event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }

  // Remove event specific arrays for event types that no
  // one is subscribed for to avoid memory leak.
  if (callbacks.length === 0) {
    delete this._callbacks['$' + event];
  }

  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};

  var args = new Array(arguments.length - 1)
    , callbacks = this._callbacks['$' + event];

  for (var i = 1; i < arguments.length; i++) {
    args[i - 1] = arguments[i];
  }

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks['$' + event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],9:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');

var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%');
if ($gOPD) {
	try {
		$gOPD([], 'length');
	} catch (e) {
		// IE 8 has a broken gOPD
		$gOPD = null;
	}
}

module.exports = $gOPD;

},{"get-intrinsic":14}],10:[function(require,module,exports){
module.exports = stringify
stringify.default = stringify
stringify.stable = deterministicStringify
stringify.stableStringify = deterministicStringify

var arr = []
var replacerStack = []

// Regular stringify
function stringify (obj, replacer, spacer) {
  decirc(obj, '', [], undefined)
  var res
  if (replacerStack.length === 0) {
    res = JSON.stringify(obj, replacer, spacer)
  } else {
    res = JSON.stringify(obj, replaceGetterValues(replacer), spacer)
  }
  while (arr.length !== 0) {
    var part = arr.pop()
    if (part.length === 4) {
      Object.defineProperty(part[0], part[1], part[3])
    } else {
      part[0][part[1]] = part[2]
    }
  }
  return res
}
function decirc (val, k, stack, parent) {
  var i
  if (typeof val === 'object' && val !== null) {
    for (i = 0; i < stack.length; i++) {
      if (stack[i] === val) {
        var propertyDescriptor = Object.getOwnPropertyDescriptor(parent, k)
        if (propertyDescriptor.get !== undefined) {
          if (propertyDescriptor.configurable) {
            Object.defineProperty(parent, k, { value: '[Circular]' })
            arr.push([parent, k, val, propertyDescriptor])
          } else {
            replacerStack.push([val, k])
          }
        } else {
          parent[k] = '[Circular]'
          arr.push([parent, k, val])
        }
        return
      }
    }
    stack.push(val)
    // Optimize for Arrays. Big arrays could kill the performance otherwise!
    if (Array.isArray(val)) {
      for (i = 0; i < val.length; i++) {
        decirc(val[i], i, stack, val)
      }
    } else {
      var keys = Object.keys(val)
      for (i = 0; i < keys.length; i++) {
        var key = keys[i]
        decirc(val[key], key, stack, val)
      }
    }
    stack.pop()
  }
}

// Stable-stringify
function compareFunction (a, b) {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}

function deterministicStringify (obj, replacer, spacer) {
  var tmp = deterministicDecirc(obj, '', [], undefined) || obj
  var res
  if (replacerStack.length === 0) {
    res = JSON.stringify(tmp, replacer, spacer)
  } else {
    res = JSON.stringify(tmp, replaceGetterValues(replacer), spacer)
  }
  while (arr.length !== 0) {
    var part = arr.pop()
    if (part.length === 4) {
      Object.defineProperty(part[0], part[1], part[3])
    } else {
      part[0][part[1]] = part[2]
    }
  }
  return res
}

function deterministicDecirc (val, k, stack, parent) {
  var i
  if (typeof val === 'object' && val !== null) {
    for (i = 0; i < stack.length; i++) {
      if (stack[i] === val) {
        var propertyDescriptor = Object.getOwnPropertyDescriptor(parent, k)
        if (propertyDescriptor.get !== undefined) {
          if (propertyDescriptor.configurable) {
            Object.defineProperty(parent, k, { value: '[Circular]' })
            arr.push([parent, k, val, propertyDescriptor])
          } else {
            replacerStack.push([val, k])
          }
        } else {
          parent[k] = '[Circular]'
          arr.push([parent, k, val])
        }
        return
      }
    }
    if (typeof val.toJSON === 'function') {
      return
    }
    stack.push(val)
    // Optimize for Arrays. Big arrays could kill the performance otherwise!
    if (Array.isArray(val)) {
      for (i = 0; i < val.length; i++) {
        deterministicDecirc(val[i], i, stack, val)
      }
    } else {
      // Create a temporary object in the required way
      var tmp = {}
      var keys = Object.keys(val).sort(compareFunction)
      for (i = 0; i < keys.length; i++) {
        var key = keys[i]
        deterministicDecirc(val[key], key, stack, val)
        tmp[key] = val[key]
      }
      if (parent !== undefined) {
        arr.push([parent, k, val])
        parent[k] = tmp
      } else {
        return tmp
      }
    }
    stack.pop()
  }
}

// wraps replacer function to handle values we couldn't replace
// and mark them as [Circular]
function replaceGetterValues (replacer) {
  replacer = replacer !== undefined ? replacer : function (k, v) { return v }
  return function (key, val) {
    if (replacerStack.length > 0) {
      for (var i = 0; i < replacerStack.length; i++) {
        var part = replacerStack[i]
        if (part[1] === key && part[0] === val) {
          val = '[Circular]'
          replacerStack.splice(i, 1)
          break
        }
      }
    }
    return replacer.call(this, key, val)
  }
}

},{}],11:[function(require,module,exports){

var hasOwn = Object.prototype.hasOwnProperty;
var toString = Object.prototype.toString;

module.exports = function forEach (obj, fn, ctx) {
    if (toString.call(fn) !== '[object Function]') {
        throw new TypeError('iterator must be a function');
    }
    var l = obj.length;
    if (l === +l) {
        for (var i = 0; i < l; i++) {
            fn.call(ctx, obj[i], i, obj);
        }
    } else {
        for (var k in obj) {
            if (hasOwn.call(obj, k)) {
                fn.call(ctx, obj[k], k, obj);
            }
        }
    }
};


},{}],12:[function(require,module,exports){
'use strict';

/* eslint no-invalid-this: 1 */

var ERROR_MESSAGE = 'Function.prototype.bind called on incompatible ';
var slice = Array.prototype.slice;
var toStr = Object.prototype.toString;
var funcType = '[object Function]';

module.exports = function bind(that) {
    var target = this;
    if (typeof target !== 'function' || toStr.call(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
    }
    var args = slice.call(arguments, 1);

    var bound;
    var binder = function () {
        if (this instanceof bound) {
            var result = target.apply(
                this,
                args.concat(slice.call(arguments))
            );
            if (Object(result) === result) {
                return result;
            }
            return this;
        } else {
            return target.apply(
                that,
                args.concat(slice.call(arguments))
            );
        }
    };

    var boundLength = Math.max(0, target.length - args.length);
    var boundArgs = [];
    for (var i = 0; i < boundLength; i++) {
        boundArgs.push('$' + i);
    }

    bound = Function('binder', 'return function (' + boundArgs.join(',') + '){ return binder.apply(this,arguments); }')(binder);

    if (target.prototype) {
        var Empty = function Empty() {};
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
    }

    return bound;
};

},{}],13:[function(require,module,exports){
'use strict';

var implementation = require('./implementation');

module.exports = Function.prototype.bind || implementation;

},{"./implementation":12}],14:[function(require,module,exports){
'use strict';

var undefined;

var $SyntaxError = SyntaxError;
var $Function = Function;
var $TypeError = TypeError;

// eslint-disable-next-line consistent-return
var getEvalledConstructor = function (expressionSyntax) {
	try {
		return $Function('"use strict"; return (' + expressionSyntax + ').constructor;')();
	} catch (e) {}
};

var $gOPD = Object.getOwnPropertyDescriptor;
if ($gOPD) {
	try {
		$gOPD({}, '');
	} catch (e) {
		$gOPD = null; // this is IE 8, which has a broken gOPD
	}
}

var throwTypeError = function () {
	throw new $TypeError();
};
var ThrowTypeError = $gOPD
	? (function () {
		try {
			// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
			arguments.callee; // IE 8 does not throw here
			return throwTypeError;
		} catch (calleeThrows) {
			try {
				// IE 8 throws on Object.getOwnPropertyDescriptor(arguments, '')
				return $gOPD(arguments, 'callee').get;
			} catch (gOPDthrows) {
				return throwTypeError;
			}
		}
	}())
	: throwTypeError;

var hasSymbols = require('has-symbols')();

var getProto = Object.getPrototypeOf || function (x) { return x.__proto__; }; // eslint-disable-line no-proto

var needsEval = {};

var TypedArray = typeof Uint8Array === 'undefined' ? undefined : getProto(Uint8Array);

var INTRINSICS = {
	'%AggregateError%': typeof AggregateError === 'undefined' ? undefined : AggregateError,
	'%Array%': Array,
	'%ArrayBuffer%': typeof ArrayBuffer === 'undefined' ? undefined : ArrayBuffer,
	'%ArrayIteratorPrototype%': hasSymbols ? getProto([][Symbol.iterator]()) : undefined,
	'%AsyncFromSyncIteratorPrototype%': undefined,
	'%AsyncFunction%': needsEval,
	'%AsyncGenerator%': needsEval,
	'%AsyncGeneratorFunction%': needsEval,
	'%AsyncIteratorPrototype%': needsEval,
	'%Atomics%': typeof Atomics === 'undefined' ? undefined : Atomics,
	'%BigInt%': typeof BigInt === 'undefined' ? undefined : BigInt,
	'%Boolean%': Boolean,
	'%DataView%': typeof DataView === 'undefined' ? undefined : DataView,
	'%Date%': Date,
	'%decodeURI%': decodeURI,
	'%decodeURIComponent%': decodeURIComponent,
	'%encodeURI%': encodeURI,
	'%encodeURIComponent%': encodeURIComponent,
	'%Error%': Error,
	'%eval%': eval, // eslint-disable-line no-eval
	'%EvalError%': EvalError,
	'%Float32Array%': typeof Float32Array === 'undefined' ? undefined : Float32Array,
	'%Float64Array%': typeof Float64Array === 'undefined' ? undefined : Float64Array,
	'%FinalizationRegistry%': typeof FinalizationRegistry === 'undefined' ? undefined : FinalizationRegistry,
	'%Function%': $Function,
	'%GeneratorFunction%': needsEval,
	'%Int8Array%': typeof Int8Array === 'undefined' ? undefined : Int8Array,
	'%Int16Array%': typeof Int16Array === 'undefined' ? undefined : Int16Array,
	'%Int32Array%': typeof Int32Array === 'undefined' ? undefined : Int32Array,
	'%isFinite%': isFinite,
	'%isNaN%': isNaN,
	'%IteratorPrototype%': hasSymbols ? getProto(getProto([][Symbol.iterator]())) : undefined,
	'%JSON%': typeof JSON === 'object' ? JSON : undefined,
	'%Map%': typeof Map === 'undefined' ? undefined : Map,
	'%MapIteratorPrototype%': typeof Map === 'undefined' || !hasSymbols ? undefined : getProto(new Map()[Symbol.iterator]()),
	'%Math%': Math,
	'%Number%': Number,
	'%Object%': Object,
	'%parseFloat%': parseFloat,
	'%parseInt%': parseInt,
	'%Promise%': typeof Promise === 'undefined' ? undefined : Promise,
	'%Proxy%': typeof Proxy === 'undefined' ? undefined : Proxy,
	'%RangeError%': RangeError,
	'%ReferenceError%': ReferenceError,
	'%Reflect%': typeof Reflect === 'undefined' ? undefined : Reflect,
	'%RegExp%': RegExp,
	'%Set%': typeof Set === 'undefined' ? undefined : Set,
	'%SetIteratorPrototype%': typeof Set === 'undefined' || !hasSymbols ? undefined : getProto(new Set()[Symbol.iterator]()),
	'%SharedArrayBuffer%': typeof SharedArrayBuffer === 'undefined' ? undefined : SharedArrayBuffer,
	'%String%': String,
	'%StringIteratorPrototype%': hasSymbols ? getProto(''[Symbol.iterator]()) : undefined,
	'%Symbol%': hasSymbols ? Symbol : undefined,
	'%SyntaxError%': $SyntaxError,
	'%ThrowTypeError%': ThrowTypeError,
	'%TypedArray%': TypedArray,
	'%TypeError%': $TypeError,
	'%Uint8Array%': typeof Uint8Array === 'undefined' ? undefined : Uint8Array,
	'%Uint8ClampedArray%': typeof Uint8ClampedArray === 'undefined' ? undefined : Uint8ClampedArray,
	'%Uint16Array%': typeof Uint16Array === 'undefined' ? undefined : Uint16Array,
	'%Uint32Array%': typeof Uint32Array === 'undefined' ? undefined : Uint32Array,
	'%URIError%': URIError,
	'%WeakMap%': typeof WeakMap === 'undefined' ? undefined : WeakMap,
	'%WeakRef%': typeof WeakRef === 'undefined' ? undefined : WeakRef,
	'%WeakSet%': typeof WeakSet === 'undefined' ? undefined : WeakSet
};

var doEval = function doEval(name) {
	var value;
	if (name === '%AsyncFunction%') {
		value = getEvalledConstructor('async function () {}');
	} else if (name === '%GeneratorFunction%') {
		value = getEvalledConstructor('function* () {}');
	} else if (name === '%AsyncGeneratorFunction%') {
		value = getEvalledConstructor('async function* () {}');
	} else if (name === '%AsyncGenerator%') {
		var fn = doEval('%AsyncGeneratorFunction%');
		if (fn) {
			value = fn.prototype;
		}
	} else if (name === '%AsyncIteratorPrototype%') {
		var gen = doEval('%AsyncGenerator%');
		if (gen) {
			value = getProto(gen.prototype);
		}
	}

	INTRINSICS[name] = value;

	return value;
};

var LEGACY_ALIASES = {
	'%ArrayBufferPrototype%': ['ArrayBuffer', 'prototype'],
	'%ArrayPrototype%': ['Array', 'prototype'],
	'%ArrayProto_entries%': ['Array', 'prototype', 'entries'],
	'%ArrayProto_forEach%': ['Array', 'prototype', 'forEach'],
	'%ArrayProto_keys%': ['Array', 'prototype', 'keys'],
	'%ArrayProto_values%': ['Array', 'prototype', 'values'],
	'%AsyncFunctionPrototype%': ['AsyncFunction', 'prototype'],
	'%AsyncGenerator%': ['AsyncGeneratorFunction', 'prototype'],
	'%AsyncGeneratorPrototype%': ['AsyncGeneratorFunction', 'prototype', 'prototype'],
	'%BooleanPrototype%': ['Boolean', 'prototype'],
	'%DataViewPrototype%': ['DataView', 'prototype'],
	'%DatePrototype%': ['Date', 'prototype'],
	'%ErrorPrototype%': ['Error', 'prototype'],
	'%EvalErrorPrototype%': ['EvalError', 'prototype'],
	'%Float32ArrayPrototype%': ['Float32Array', 'prototype'],
	'%Float64ArrayPrototype%': ['Float64Array', 'prototype'],
	'%FunctionPrototype%': ['Function', 'prototype'],
	'%Generator%': ['GeneratorFunction', 'prototype'],
	'%GeneratorPrototype%': ['GeneratorFunction', 'prototype', 'prototype'],
	'%Int8ArrayPrototype%': ['Int8Array', 'prototype'],
	'%Int16ArrayPrototype%': ['Int16Array', 'prototype'],
	'%Int32ArrayPrototype%': ['Int32Array', 'prototype'],
	'%JSONParse%': ['JSON', 'parse'],
	'%JSONStringify%': ['JSON', 'stringify'],
	'%MapPrototype%': ['Map', 'prototype'],
	'%NumberPrototype%': ['Number', 'prototype'],
	'%ObjectPrototype%': ['Object', 'prototype'],
	'%ObjProto_toString%': ['Object', 'prototype', 'toString'],
	'%ObjProto_valueOf%': ['Object', 'prototype', 'valueOf'],
	'%PromisePrototype%': ['Promise', 'prototype'],
	'%PromiseProto_then%': ['Promise', 'prototype', 'then'],
	'%Promise_all%': ['Promise', 'all'],
	'%Promise_reject%': ['Promise', 'reject'],
	'%Promise_resolve%': ['Promise', 'resolve'],
	'%RangeErrorPrototype%': ['RangeError', 'prototype'],
	'%ReferenceErrorPrototype%': ['ReferenceError', 'prototype'],
	'%RegExpPrototype%': ['RegExp', 'prototype'],
	'%SetPrototype%': ['Set', 'prototype'],
	'%SharedArrayBufferPrototype%': ['SharedArrayBuffer', 'prototype'],
	'%StringPrototype%': ['String', 'prototype'],
	'%SymbolPrototype%': ['Symbol', 'prototype'],
	'%SyntaxErrorPrototype%': ['SyntaxError', 'prototype'],
	'%TypedArrayPrototype%': ['TypedArray', 'prototype'],
	'%TypeErrorPrototype%': ['TypeError', 'prototype'],
	'%Uint8ArrayPrototype%': ['Uint8Array', 'prototype'],
	'%Uint8ClampedArrayPrototype%': ['Uint8ClampedArray', 'prototype'],
	'%Uint16ArrayPrototype%': ['Uint16Array', 'prototype'],
	'%Uint32ArrayPrototype%': ['Uint32Array', 'prototype'],
	'%URIErrorPrototype%': ['URIError', 'prototype'],
	'%WeakMapPrototype%': ['WeakMap', 'prototype'],
	'%WeakSetPrototype%': ['WeakSet', 'prototype']
};

var bind = require('function-bind');
var hasOwn = require('has');
var $concat = bind.call(Function.call, Array.prototype.concat);
var $spliceApply = bind.call(Function.apply, Array.prototype.splice);
var $replace = bind.call(Function.call, String.prototype.replace);
var $strSlice = bind.call(Function.call, String.prototype.slice);

/* adapted from https://github.com/lodash/lodash/blob/4.17.15/dist/lodash.js#L6735-L6744 */
var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
var reEscapeChar = /\\(\\)?/g; /** Used to match backslashes in property paths. */
var stringToPath = function stringToPath(string) {
	var first = $strSlice(string, 0, 1);
	var last = $strSlice(string, -1);
	if (first === '%' && last !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected closing `%`');
	} else if (last === '%' && first !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected opening `%`');
	}
	var result = [];
	$replace(string, rePropName, function (match, number, quote, subString) {
		result[result.length] = quote ? $replace(subString, reEscapeChar, '$1') : number || match;
	});
	return result;
};
/* end adaptation */

var getBaseIntrinsic = function getBaseIntrinsic(name, allowMissing) {
	var intrinsicName = name;
	var alias;
	if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
		alias = LEGACY_ALIASES[intrinsicName];
		intrinsicName = '%' + alias[0] + '%';
	}

	if (hasOwn(INTRINSICS, intrinsicName)) {
		var value = INTRINSICS[intrinsicName];
		if (value === needsEval) {
			value = doEval(intrinsicName);
		}
		if (typeof value === 'undefined' && !allowMissing) {
			throw new $TypeError('intrinsic ' + name + ' exists, but is not available. Please file an issue!');
		}

		return {
			alias: alias,
			name: intrinsicName,
			value: value
		};
	}

	throw new $SyntaxError('intrinsic ' + name + ' does not exist!');
};

module.exports = function GetIntrinsic(name, allowMissing) {
	if (typeof name !== 'string' || name.length === 0) {
		throw new $TypeError('intrinsic name must be a non-empty string');
	}
	if (arguments.length > 1 && typeof allowMissing !== 'boolean') {
		throw new $TypeError('"allowMissing" argument must be a boolean');
	}

	var parts = stringToPath(name);
	var intrinsicBaseName = parts.length > 0 ? parts[0] : '';

	var intrinsic = getBaseIntrinsic('%' + intrinsicBaseName + '%', allowMissing);
	var intrinsicRealName = intrinsic.name;
	var value = intrinsic.value;
	var skipFurtherCaching = false;

	var alias = intrinsic.alias;
	if (alias) {
		intrinsicBaseName = alias[0];
		$spliceApply(parts, $concat([0, 1], alias));
	}

	for (var i = 1, isOwn = true; i < parts.length; i += 1) {
		var part = parts[i];
		var first = $strSlice(part, 0, 1);
		var last = $strSlice(part, -1);
		if (
			(
				(first === '"' || first === "'" || first === '`')
				|| (last === '"' || last === "'" || last === '`')
			)
			&& first !== last
		) {
			throw new $SyntaxError('property names with quotes must have matching quotes');
		}
		if (part === 'constructor' || !isOwn) {
			skipFurtherCaching = true;
		}

		intrinsicBaseName += '.' + part;
		intrinsicRealName = '%' + intrinsicBaseName + '%';

		if (hasOwn(INTRINSICS, intrinsicRealName)) {
			value = INTRINSICS[intrinsicRealName];
		} else if (value != null) {
			if (!(part in value)) {
				if (!allowMissing) {
					throw new $TypeError('base intrinsic for ' + name + ' exists, but the property is not available.');
				}
				return void undefined;
			}
			if ($gOPD && (i + 1) >= parts.length) {
				var desc = $gOPD(value, part);
				isOwn = !!desc;

				// By convention, when a data property is converted to an accessor
				// property to emulate a data property that does not suffer from
				// the override mistake, that accessor's getter is marked with
				// an `originalValue` property. Here, when we detect this, we
				// uphold the illusion by pretending to see that original data
				// property, i.e., returning the value rather than the getter
				// itself.
				if (isOwn && 'get' in desc && !('originalValue' in desc.get)) {
					value = desc.get;
				} else {
					value = value[part];
				}
			} else {
				isOwn = hasOwn(value, part);
				value = value[part];
			}

			if (isOwn && !skipFurtherCaching) {
				INTRINSICS[intrinsicRealName] = value;
			}
		}
	}
	return value;
};

},{"function-bind":13,"has":17,"has-symbols":15}],15:[function(require,module,exports){
'use strict';

var origSymbol = typeof Symbol !== 'undefined' && Symbol;
var hasSymbolSham = require('./shams');

module.exports = function hasNativeSymbols() {
	if (typeof origSymbol !== 'function') { return false; }
	if (typeof Symbol !== 'function') { return false; }
	if (typeof origSymbol('foo') !== 'symbol') { return false; }
	if (typeof Symbol('bar') !== 'symbol') { return false; }

	return hasSymbolSham();
};

},{"./shams":16}],16:[function(require,module,exports){
'use strict';

/* eslint complexity: [2, 18], max-statements: [2, 33] */
module.exports = function hasSymbols() {
	if (typeof Symbol !== 'function' || typeof Object.getOwnPropertySymbols !== 'function') { return false; }
	if (typeof Symbol.iterator === 'symbol') { return true; }

	var obj = {};
	var sym = Symbol('test');
	var symObj = Object(sym);
	if (typeof sym === 'string') { return false; }

	if (Object.prototype.toString.call(sym) !== '[object Symbol]') { return false; }
	if (Object.prototype.toString.call(symObj) !== '[object Symbol]') { return false; }

	// temp disabled per https://github.com/ljharb/object.assign/issues/17
	// if (sym instanceof Symbol) { return false; }
	// temp disabled per https://github.com/WebReflection/get-own-property-symbols/issues/4
	// if (!(symObj instanceof Symbol)) { return false; }

	// if (typeof Symbol.prototype.toString !== 'function') { return false; }
	// if (String(sym) !== Symbol.prototype.toString.call(sym)) { return false; }

	var symVal = 42;
	obj[sym] = symVal;
	for (sym in obj) { return false; } // eslint-disable-line no-restricted-syntax, no-unreachable-loop
	if (typeof Object.keys === 'function' && Object.keys(obj).length !== 0) { return false; }

	if (typeof Object.getOwnPropertyNames === 'function' && Object.getOwnPropertyNames(obj).length !== 0) { return false; }

	var syms = Object.getOwnPropertySymbols(obj);
	if (syms.length !== 1 || syms[0] !== sym) { return false; }

	if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) { return false; }

	if (typeof Object.getOwnPropertyDescriptor === 'function') {
		var descriptor = Object.getOwnPropertyDescriptor(obj, sym);
		if (descriptor.value !== symVal || descriptor.enumerable !== true) { return false; }
	}

	return true;
};

},{}],17:[function(require,module,exports){
'use strict';

var bind = require('function-bind');

module.exports = bind.call(Function.call, Object.prototype.hasOwnProperty);

},{"function-bind":13}],18:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}

},{}],19:[function(require,module,exports){
'use strict';

var hasToStringTag = typeof Symbol === 'function' && typeof Symbol.toStringTag === 'symbol';
var callBound = require('call-bind/callBound');

var $toString = callBound('Object.prototype.toString');

var isStandardArguments = function isArguments(value) {
	if (hasToStringTag && value && typeof value === 'object' && Symbol.toStringTag in value) {
		return false;
	}
	return $toString(value) === '[object Arguments]';
};

var isLegacyArguments = function isArguments(value) {
	if (isStandardArguments(value)) {
		return true;
	}
	return value !== null &&
		typeof value === 'object' &&
		typeof value.length === 'number' &&
		value.length >= 0 &&
		$toString(value) !== '[object Array]' &&
		$toString(value.callee) === '[object Function]';
};

var supportsStandardArguments = (function () {
	return isStandardArguments(arguments);
}());

isStandardArguments.isLegacyArguments = isLegacyArguments; // for tests

module.exports = supportsStandardArguments ? isStandardArguments : isLegacyArguments;

},{"call-bind/callBound":6}],20:[function(require,module,exports){
'use strict';

var toStr = Object.prototype.toString;
var fnToStr = Function.prototype.toString;
var isFnRegex = /^\s*(?:function)?\*/;
var hasToStringTag = typeof Symbol === 'function' && typeof Symbol.toStringTag === 'symbol';
var getProto = Object.getPrototypeOf;
var getGeneratorFunc = function () { // eslint-disable-line consistent-return
	if (!hasToStringTag) {
		return false;
	}
	try {
		return Function('return function*() {}')();
	} catch (e) {
	}
};
var generatorFunc = getGeneratorFunc();
var GeneratorFunction = getProto && generatorFunc ? getProto(generatorFunc) : false;

module.exports = function isGeneratorFunction(fn) {
	if (typeof fn !== 'function') {
		return false;
	}
	if (isFnRegex.test(fnToStr.call(fn))) {
		return true;
	}
	if (!hasToStringTag) {
		var str = toStr.call(fn);
		return str === '[object GeneratorFunction]';
	}
	return getProto && getProto(fn) === GeneratorFunction;
};

},{}],21:[function(require,module,exports){
(function (global){(function (){
'use strict';

var forEach = require('foreach');
var availableTypedArrays = require('available-typed-arrays');
var callBound = require('call-bind/callBound');

var $toString = callBound('Object.prototype.toString');
var hasSymbols = require('has-symbols')();
var hasToStringTag = hasSymbols && typeof Symbol.toStringTag === 'symbol';

var typedArrays = availableTypedArrays();

var $indexOf = callBound('Array.prototype.indexOf', true) || function indexOf(array, value) {
	for (var i = 0; i < array.length; i += 1) {
		if (array[i] === value) {
			return i;
		}
	}
	return -1;
};
var $slice = callBound('String.prototype.slice');
var toStrTags = {};
var gOPD = require('es-abstract/helpers/getOwnPropertyDescriptor');
var getPrototypeOf = Object.getPrototypeOf; // require('getprototypeof');
if (hasToStringTag && gOPD && getPrototypeOf) {
	forEach(typedArrays, function (typedArray) {
		var arr = new global[typedArray]();
		if (!(Symbol.toStringTag in arr)) {
			throw new EvalError('this engine has support for Symbol.toStringTag, but ' + typedArray + ' does not have the property! Please report this.');
		}
		var proto = getPrototypeOf(arr);
		var descriptor = gOPD(proto, Symbol.toStringTag);
		if (!descriptor) {
			var superProto = getPrototypeOf(proto);
			descriptor = gOPD(superProto, Symbol.toStringTag);
		}
		toStrTags[typedArray] = descriptor.get;
	});
}

var tryTypedArrays = function tryAllTypedArrays(value) {
	var anyTrue = false;
	forEach(toStrTags, function (getter, typedArray) {
		if (!anyTrue) {
			try {
				anyTrue = getter.call(value) === typedArray;
			} catch (e) { /**/ }
		}
	});
	return anyTrue;
};

module.exports = function isTypedArray(value) {
	if (!value || typeof value !== 'object') { return false; }
	if (!hasToStringTag) {
		var tag = $slice($toString(value), 8, -1);
		return $indexOf(typedArrays, tag) > -1;
	}
	if (!gOPD) { return false; }
	return tryTypedArrays(value);
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"available-typed-arrays":4,"call-bind/callBound":6,"es-abstract/helpers/getOwnPropertyDescriptor":9,"foreach":11,"has-symbols":15}],22:[function(require,module,exports){
var hasMap = typeof Map === 'function' && Map.prototype;
var mapSizeDescriptor = Object.getOwnPropertyDescriptor && hasMap ? Object.getOwnPropertyDescriptor(Map.prototype, 'size') : null;
var mapSize = hasMap && mapSizeDescriptor && typeof mapSizeDescriptor.get === 'function' ? mapSizeDescriptor.get : null;
var mapForEach = hasMap && Map.prototype.forEach;
var hasSet = typeof Set === 'function' && Set.prototype;
var setSizeDescriptor = Object.getOwnPropertyDescriptor && hasSet ? Object.getOwnPropertyDescriptor(Set.prototype, 'size') : null;
var setSize = hasSet && setSizeDescriptor && typeof setSizeDescriptor.get === 'function' ? setSizeDescriptor.get : null;
var setForEach = hasSet && Set.prototype.forEach;
var hasWeakMap = typeof WeakMap === 'function' && WeakMap.prototype;
var weakMapHas = hasWeakMap ? WeakMap.prototype.has : null;
var hasWeakSet = typeof WeakSet === 'function' && WeakSet.prototype;
var weakSetHas = hasWeakSet ? WeakSet.prototype.has : null;
var booleanValueOf = Boolean.prototype.valueOf;
var objectToString = Object.prototype.toString;
var functionToString = Function.prototype.toString;
var match = String.prototype.match;
var bigIntValueOf = typeof BigInt === 'function' ? BigInt.prototype.valueOf : null;
var gOPS = Object.getOwnPropertySymbols;
var symToString = typeof Symbol === 'function' ? Symbol.prototype.toString : null;
var isEnumerable = Object.prototype.propertyIsEnumerable;

var inspectCustom = require('./util.inspect').custom;
var inspectSymbol = inspectCustom && isSymbol(inspectCustom) ? inspectCustom : null;

module.exports = function inspect_(obj, options, depth, seen) {
    var opts = options || {};

    if (has(opts, 'quoteStyle') && (opts.quoteStyle !== 'single' && opts.quoteStyle !== 'double')) {
        throw new TypeError('option "quoteStyle" must be "single" or "double"');
    }
    if (
        has(opts, 'maxStringLength') && (typeof opts.maxStringLength === 'number'
            ? opts.maxStringLength < 0 && opts.maxStringLength !== Infinity
            : opts.maxStringLength !== null
        )
    ) {
        throw new TypeError('option "maxStringLength", if provided, must be a positive integer, Infinity, or `null`');
    }
    var customInspect = has(opts, 'customInspect') ? opts.customInspect : true;
    if (typeof customInspect !== 'boolean') {
        throw new TypeError('option "customInspect", if provided, must be `true` or `false`');
    }

    if (
        has(opts, 'indent')
        && opts.indent !== null
        && opts.indent !== '\t'
        && !(parseInt(opts.indent, 10) === opts.indent && opts.indent > 0)
    ) {
        throw new TypeError('options "indent" must be "\\t", an integer > 0, or `null`');
    }

    if (typeof obj === 'undefined') {
        return 'undefined';
    }
    if (obj === null) {
        return 'null';
    }
    if (typeof obj === 'boolean') {
        return obj ? 'true' : 'false';
    }

    if (typeof obj === 'string') {
        return inspectString(obj, opts);
    }
    if (typeof obj === 'number') {
        if (obj === 0) {
            return Infinity / obj > 0 ? '0' : '-0';
        }
        return String(obj);
    }
    if (typeof obj === 'bigint') {
        return String(obj) + 'n';
    }

    var maxDepth = typeof opts.depth === 'undefined' ? 5 : opts.depth;
    if (typeof depth === 'undefined') { depth = 0; }
    if (depth >= maxDepth && maxDepth > 0 && typeof obj === 'object') {
        return isArray(obj) ? '[Array]' : '[Object]';
    }

    var indent = getIndent(opts, depth);

    if (typeof seen === 'undefined') {
        seen = [];
    } else if (indexOf(seen, obj) >= 0) {
        return '[Circular]';
    }

    function inspect(value, from, noIndent) {
        if (from) {
            seen = seen.slice();
            seen.push(from);
        }
        if (noIndent) {
            var newOpts = {
                depth: opts.depth
            };
            if (has(opts, 'quoteStyle')) {
                newOpts.quoteStyle = opts.quoteStyle;
            }
            return inspect_(value, newOpts, depth + 1, seen);
        }
        return inspect_(value, opts, depth + 1, seen);
    }

    if (typeof obj === 'function') {
        var name = nameOf(obj);
        var keys = arrObjKeys(obj, inspect);
        return '[Function' + (name ? ': ' + name : ' (anonymous)') + ']' + (keys.length > 0 ? ' { ' + keys.join(', ') + ' }' : '');
    }
    if (isSymbol(obj)) {
        var symString = symToString.call(obj);
        return typeof obj === 'object' ? markBoxed(symString) : symString;
    }
    if (isElement(obj)) {
        var s = '<' + String(obj.nodeName).toLowerCase();
        var attrs = obj.attributes || [];
        for (var i = 0; i < attrs.length; i++) {
            s += ' ' + attrs[i].name + '=' + wrapQuotes(quote(attrs[i].value), 'double', opts);
        }
        s += '>';
        if (obj.childNodes && obj.childNodes.length) { s += '...'; }
        s += '</' + String(obj.nodeName).toLowerCase() + '>';
        return s;
    }
    if (isArray(obj)) {
        if (obj.length === 0) { return '[]'; }
        var xs = arrObjKeys(obj, inspect);
        if (indent && !singleLineValues(xs)) {
            return '[' + indentedJoin(xs, indent) + ']';
        }
        return '[ ' + xs.join(', ') + ' ]';
    }
    if (isError(obj)) {
        var parts = arrObjKeys(obj, inspect);
        if (parts.length === 0) { return '[' + String(obj) + ']'; }
        return '{ [' + String(obj) + '] ' + parts.join(', ') + ' }';
    }
    if (typeof obj === 'object' && customInspect) {
        if (inspectSymbol && typeof obj[inspectSymbol] === 'function') {
            return obj[inspectSymbol]();
        } else if (typeof obj.inspect === 'function') {
            return obj.inspect();
        }
    }
    if (isMap(obj)) {
        var mapParts = [];
        mapForEach.call(obj, function (value, key) {
            mapParts.push(inspect(key, obj, true) + ' => ' + inspect(value, obj));
        });
        return collectionOf('Map', mapSize.call(obj), mapParts, indent);
    }
    if (isSet(obj)) {
        var setParts = [];
        setForEach.call(obj, function (value) {
            setParts.push(inspect(value, obj));
        });
        return collectionOf('Set', setSize.call(obj), setParts, indent);
    }
    if (isWeakMap(obj)) {
        return weakCollectionOf('WeakMap');
    }
    if (isWeakSet(obj)) {
        return weakCollectionOf('WeakSet');
    }
    if (isNumber(obj)) {
        return markBoxed(inspect(Number(obj)));
    }
    if (isBigInt(obj)) {
        return markBoxed(inspect(bigIntValueOf.call(obj)));
    }
    if (isBoolean(obj)) {
        return markBoxed(booleanValueOf.call(obj));
    }
    if (isString(obj)) {
        return markBoxed(inspect(String(obj)));
    }
    if (!isDate(obj) && !isRegExp(obj)) {
        var ys = arrObjKeys(obj, inspect);
        if (ys.length === 0) { return '{}'; }
        if (indent) {
            return '{' + indentedJoin(ys, indent) + '}';
        }
        return '{ ' + ys.join(', ') + ' }';
    }
    return String(obj);
};

function wrapQuotes(s, defaultStyle, opts) {
    var quoteChar = (opts.quoteStyle || defaultStyle) === 'double' ? '"' : "'";
    return quoteChar + s + quoteChar;
}

function quote(s) {
    return String(s).replace(/"/g, '&quot;');
}

function isArray(obj) { return toStr(obj) === '[object Array]'; }
function isDate(obj) { return toStr(obj) === '[object Date]'; }
function isRegExp(obj) { return toStr(obj) === '[object RegExp]'; }
function isError(obj) { return toStr(obj) === '[object Error]'; }
function isSymbol(obj) { return toStr(obj) === '[object Symbol]'; }
function isString(obj) { return toStr(obj) === '[object String]'; }
function isNumber(obj) { return toStr(obj) === '[object Number]'; }
function isBigInt(obj) { return toStr(obj) === '[object BigInt]'; }
function isBoolean(obj) { return toStr(obj) === '[object Boolean]'; }

var hasOwn = Object.prototype.hasOwnProperty || function (key) { return key in this; };
function has(obj, key) {
    return hasOwn.call(obj, key);
}

function toStr(obj) {
    return objectToString.call(obj);
}

function nameOf(f) {
    if (f.name) { return f.name; }
    var m = match.call(functionToString.call(f), /^function\s*([\w$]+)/);
    if (m) { return m[1]; }
    return null;
}

function indexOf(xs, x) {
    if (xs.indexOf) { return xs.indexOf(x); }
    for (var i = 0, l = xs.length; i < l; i++) {
        if (xs[i] === x) { return i; }
    }
    return -1;
}

function isMap(x) {
    if (!mapSize || !x || typeof x !== 'object') {
        return false;
    }
    try {
        mapSize.call(x);
        try {
            setSize.call(x);
        } catch (s) {
            return true;
        }
        return x instanceof Map; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakMap(x) {
    if (!weakMapHas || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakMapHas.call(x, weakMapHas);
        try {
            weakSetHas.call(x, weakSetHas);
        } catch (s) {
            return true;
        }
        return x instanceof WeakMap; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isSet(x) {
    if (!setSize || !x || typeof x !== 'object') {
        return false;
    }
    try {
        setSize.call(x);
        try {
            mapSize.call(x);
        } catch (m) {
            return true;
        }
        return x instanceof Set; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakSet(x) {
    if (!weakSetHas || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakSetHas.call(x, weakSetHas);
        try {
            weakMapHas.call(x, weakMapHas);
        } catch (s) {
            return true;
        }
        return x instanceof WeakSet; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isElement(x) {
    if (!x || typeof x !== 'object') { return false; }
    if (typeof HTMLElement !== 'undefined' && x instanceof HTMLElement) {
        return true;
    }
    return typeof x.nodeName === 'string' && typeof x.getAttribute === 'function';
}

function inspectString(str, opts) {
    if (str.length > opts.maxStringLength) {
        var remaining = str.length - opts.maxStringLength;
        var trailer = '... ' + remaining + ' more character' + (remaining > 1 ? 's' : '');
        return inspectString(str.slice(0, opts.maxStringLength), opts) + trailer;
    }
    // eslint-disable-next-line no-control-regex
    var s = str.replace(/(['\\])/g, '\\$1').replace(/[\x00-\x1f]/g, lowbyte);
    return wrapQuotes(s, 'single', opts);
}

function lowbyte(c) {
    var n = c.charCodeAt(0);
    var x = {
        8: 'b',
        9: 't',
        10: 'n',
        12: 'f',
        13: 'r'
    }[n];
    if (x) { return '\\' + x; }
    return '\\x' + (n < 0x10 ? '0' : '') + n.toString(16).toUpperCase();
}

function markBoxed(str) {
    return 'Object(' + str + ')';
}

function weakCollectionOf(type) {
    return type + ' { ? }';
}

function collectionOf(type, size, entries, indent) {
    var joinedEntries = indent ? indentedJoin(entries, indent) : entries.join(', ');
    return type + ' (' + size + ') {' + joinedEntries + '}';
}

function singleLineValues(xs) {
    for (var i = 0; i < xs.length; i++) {
        if (indexOf(xs[i], '\n') >= 0) {
            return false;
        }
    }
    return true;
}

function getIndent(opts, depth) {
    var baseIndent;
    if (opts.indent === '\t') {
        baseIndent = '\t';
    } else if (typeof opts.indent === 'number' && opts.indent > 0) {
        baseIndent = Array(opts.indent + 1).join(' ');
    } else {
        return null;
    }
    return {
        base: baseIndent,
        prev: Array(depth + 1).join(baseIndent)
    };
}

function indentedJoin(xs, indent) {
    if (xs.length === 0) { return ''; }
    var lineJoiner = '\n' + indent.prev + indent.base;
    return lineJoiner + xs.join(',' + lineJoiner) + '\n' + indent.prev;
}

function arrObjKeys(obj, inspect) {
    var isArr = isArray(obj);
    var xs = [];
    if (isArr) {
        xs.length = obj.length;
        for (var i = 0; i < obj.length; i++) {
            xs[i] = has(obj, i) ? inspect(obj[i], obj) : '';
        }
    }
    for (var key in obj) { // eslint-disable-line no-restricted-syntax
        if (!has(obj, key)) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if (isArr && String(Number(key)) === key && key < obj.length) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if ((/[^\w$]/).test(key)) {
            xs.push(inspect(key, obj) + ': ' + inspect(obj[key], obj));
        } else {
            xs.push(key + ': ' + inspect(obj[key], obj));
        }
    }
    if (typeof gOPS === 'function') {
        var syms = gOPS(obj);
        for (var j = 0; j < syms.length; j++) {
            if (isEnumerable.call(obj, syms[j])) {
                xs.push('[' + inspect(syms[j]) + ']: ' + inspect(obj[syms[j]], obj));
            }
        }
    }
    return xs;
}

},{"./util.inspect":5}],23:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],24:[function(require,module,exports){
'use strict';

var replace = String.prototype.replace;
var percentTwenties = /%20/g;

var Format = {
    RFC1738: 'RFC1738',
    RFC3986: 'RFC3986'
};

module.exports = {
    'default': Format.RFC3986,
    formatters: {
        RFC1738: function (value) {
            return replace.call(value, percentTwenties, '+');
        },
        RFC3986: function (value) {
            return String(value);
        }
    },
    RFC1738: Format.RFC1738,
    RFC3986: Format.RFC3986
};

},{}],25:[function(require,module,exports){
'use strict';

var stringify = require('./stringify');
var parse = require('./parse');
var formats = require('./formats');

module.exports = {
    formats: formats,
    parse: parse,
    stringify: stringify
};

},{"./formats":24,"./parse":26,"./stringify":27}],26:[function(require,module,exports){
'use strict';

var utils = require('./utils');

var has = Object.prototype.hasOwnProperty;
var isArray = Array.isArray;

var defaults = {
    allowDots: false,
    allowPrototypes: false,
    allowSparse: false,
    arrayLimit: 20,
    charset: 'utf-8',
    charsetSentinel: false,
    comma: false,
    decoder: utils.decode,
    delimiter: '&',
    depth: 5,
    ignoreQueryPrefix: false,
    interpretNumericEntities: false,
    parameterLimit: 1000,
    parseArrays: true,
    plainObjects: false,
    strictNullHandling: false
};

var interpretNumericEntities = function (str) {
    return str.replace(/&#(\d+);/g, function ($0, numberStr) {
        return String.fromCharCode(parseInt(numberStr, 10));
    });
};

var parseArrayValue = function (val, options) {
    if (val && typeof val === 'string' && options.comma && val.indexOf(',') > -1) {
        return val.split(',');
    }

    return val;
};

// This is what browsers will submit when the ✓ character occurs in an
// application/x-www-form-urlencoded body and the encoding of the page containing
// the form is iso-8859-1, or when the submitted form has an accept-charset
// attribute of iso-8859-1. Presumably also with other charsets that do not contain
// the ✓ character, such as us-ascii.
var isoSentinel = 'utf8=%26%2310003%3B'; // encodeURIComponent('&#10003;')

// These are the percent-encoded utf-8 octets representing a checkmark, indicating that the request actually is utf-8 encoded.
var charsetSentinel = 'utf8=%E2%9C%93'; // encodeURIComponent('✓')

var parseValues = function parseQueryStringValues(str, options) {
    var obj = {};
    var cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, '') : str;
    var limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit;
    var parts = cleanStr.split(options.delimiter, limit);
    var skipIndex = -1; // Keep track of where the utf8 sentinel was found
    var i;

    var charset = options.charset;
    if (options.charsetSentinel) {
        for (i = 0; i < parts.length; ++i) {
            if (parts[i].indexOf('utf8=') === 0) {
                if (parts[i] === charsetSentinel) {
                    charset = 'utf-8';
                } else if (parts[i] === isoSentinel) {
                    charset = 'iso-8859-1';
                }
                skipIndex = i;
                i = parts.length; // The eslint settings do not allow break;
            }
        }
    }

    for (i = 0; i < parts.length; ++i) {
        if (i === skipIndex) {
            continue;
        }
        var part = parts[i];

        var bracketEqualsPos = part.indexOf(']=');
        var pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1;

        var key, val;
        if (pos === -1) {
            key = options.decoder(part, defaults.decoder, charset, 'key');
            val = options.strictNullHandling ? null : '';
        } else {
            key = options.decoder(part.slice(0, pos), defaults.decoder, charset, 'key');
            val = utils.maybeMap(
                parseArrayValue(part.slice(pos + 1), options),
                function (encodedVal) {
                    return options.decoder(encodedVal, defaults.decoder, charset, 'value');
                }
            );
        }

        if (val && options.interpretNumericEntities && charset === 'iso-8859-1') {
            val = interpretNumericEntities(val);
        }

        if (part.indexOf('[]=') > -1) {
            val = isArray(val) ? [val] : val;
        }

        if (has.call(obj, key)) {
            obj[key] = utils.combine(obj[key], val);
        } else {
            obj[key] = val;
        }
    }

    return obj;
};

var parseObject = function (chain, val, options, valuesParsed) {
    var leaf = valuesParsed ? val : parseArrayValue(val, options);

    for (var i = chain.length - 1; i >= 0; --i) {
        var obj;
        var root = chain[i];

        if (root === '[]' && options.parseArrays) {
            obj = [].concat(leaf);
        } else {
            obj = options.plainObjects ? Object.create(null) : {};
            var cleanRoot = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root;
            var index = parseInt(cleanRoot, 10);
            if (!options.parseArrays && cleanRoot === '') {
                obj = { 0: leaf };
            } else if (
                !isNaN(index)
                && root !== cleanRoot
                && String(index) === cleanRoot
                && index >= 0
                && (options.parseArrays && index <= options.arrayLimit)
            ) {
                obj = [];
                obj[index] = leaf;
            } else {
                obj[cleanRoot] = leaf;
            }
        }

        leaf = obj;
    }

    return leaf;
};

var parseKeys = function parseQueryStringKeys(givenKey, val, options, valuesParsed) {
    if (!givenKey) {
        return;
    }

    // Transform dot notation to bracket notation
    var key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, '[$1]') : givenKey;

    // The regex chunks

    var brackets = /(\[[^[\]]*])/;
    var child = /(\[[^[\]]*])/g;

    // Get the parent

    var segment = options.depth > 0 && brackets.exec(key);
    var parent = segment ? key.slice(0, segment.index) : key;

    // Stash the parent if it exists

    var keys = [];
    if (parent) {
        // If we aren't using plain objects, optionally prefix keys that would overwrite object prototype properties
        if (!options.plainObjects && has.call(Object.prototype, parent)) {
            if (!options.allowPrototypes) {
                return;
            }
        }

        keys.push(parent);
    }

    // Loop through children appending to the array until we hit depth

    var i = 0;
    while (options.depth > 0 && (segment = child.exec(key)) !== null && i < options.depth) {
        i += 1;
        if (!options.plainObjects && has.call(Object.prototype, segment[1].slice(1, -1))) {
            if (!options.allowPrototypes) {
                return;
            }
        }
        keys.push(segment[1]);
    }

    // If there's a remainder, just add whatever is left

    if (segment) {
        keys.push('[' + key.slice(segment.index) + ']');
    }

    return parseObject(keys, val, options, valuesParsed);
};

var normalizeParseOptions = function normalizeParseOptions(opts) {
    if (!opts) {
        return defaults;
    }

    if (opts.decoder !== null && opts.decoder !== undefined && typeof opts.decoder !== 'function') {
        throw new TypeError('Decoder has to be a function.');
    }

    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }
    var charset = typeof opts.charset === 'undefined' ? defaults.charset : opts.charset;

    return {
        allowDots: typeof opts.allowDots === 'undefined' ? defaults.allowDots : !!opts.allowDots,
        allowPrototypes: typeof opts.allowPrototypes === 'boolean' ? opts.allowPrototypes : defaults.allowPrototypes,
        allowSparse: typeof opts.allowSparse === 'boolean' ? opts.allowSparse : defaults.allowSparse,
        arrayLimit: typeof opts.arrayLimit === 'number' ? opts.arrayLimit : defaults.arrayLimit,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        comma: typeof opts.comma === 'boolean' ? opts.comma : defaults.comma,
        decoder: typeof opts.decoder === 'function' ? opts.decoder : defaults.decoder,
        delimiter: typeof opts.delimiter === 'string' || utils.isRegExp(opts.delimiter) ? opts.delimiter : defaults.delimiter,
        // eslint-disable-next-line no-implicit-coercion, no-extra-parens
        depth: (typeof opts.depth === 'number' || opts.depth === false) ? +opts.depth : defaults.depth,
        ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
        interpretNumericEntities: typeof opts.interpretNumericEntities === 'boolean' ? opts.interpretNumericEntities : defaults.interpretNumericEntities,
        parameterLimit: typeof opts.parameterLimit === 'number' ? opts.parameterLimit : defaults.parameterLimit,
        parseArrays: opts.parseArrays !== false,
        plainObjects: typeof opts.plainObjects === 'boolean' ? opts.plainObjects : defaults.plainObjects,
        strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
    };
};

module.exports = function (str, opts) {
    var options = normalizeParseOptions(opts);

    if (str === '' || str === null || typeof str === 'undefined') {
        return options.plainObjects ? Object.create(null) : {};
    }

    var tempObj = typeof str === 'string' ? parseValues(str, options) : str;
    var obj = options.plainObjects ? Object.create(null) : {};

    // Iterate over the keys and setup the new object

    var keys = Object.keys(tempObj);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var newObj = parseKeys(key, tempObj[key], options, typeof str === 'string');
        obj = utils.merge(obj, newObj, options);
    }

    if (options.allowSparse === true) {
        return obj;
    }

    return utils.compact(obj);
};

},{"./utils":28}],27:[function(require,module,exports){
'use strict';

var getSideChannel = require('side-channel');
var utils = require('./utils');
var formats = require('./formats');
var has = Object.prototype.hasOwnProperty;

var arrayPrefixGenerators = {
    brackets: function brackets(prefix) {
        return prefix + '[]';
    },
    comma: 'comma',
    indices: function indices(prefix, key) {
        return prefix + '[' + key + ']';
    },
    repeat: function repeat(prefix) {
        return prefix;
    }
};

var isArray = Array.isArray;
var push = Array.prototype.push;
var pushToArray = function (arr, valueOrArray) {
    push.apply(arr, isArray(valueOrArray) ? valueOrArray : [valueOrArray]);
};

var toISO = Date.prototype.toISOString;

var defaultFormat = formats['default'];
var defaults = {
    addQueryPrefix: false,
    allowDots: false,
    charset: 'utf-8',
    charsetSentinel: false,
    delimiter: '&',
    encode: true,
    encoder: utils.encode,
    encodeValuesOnly: false,
    format: defaultFormat,
    formatter: formats.formatters[defaultFormat],
    // deprecated
    indices: false,
    serializeDate: function serializeDate(date) {
        return toISO.call(date);
    },
    skipNulls: false,
    strictNullHandling: false
};

var isNonNullishPrimitive = function isNonNullishPrimitive(v) {
    return typeof v === 'string'
        || typeof v === 'number'
        || typeof v === 'boolean'
        || typeof v === 'symbol'
        || typeof v === 'bigint';
};

var stringify = function stringify(
    object,
    prefix,
    generateArrayPrefix,
    strictNullHandling,
    skipNulls,
    encoder,
    filter,
    sort,
    allowDots,
    serializeDate,
    format,
    formatter,
    encodeValuesOnly,
    charset,
    sideChannel
) {
    var obj = object;

    if (sideChannel.has(object)) {
        throw new RangeError('Cyclic object value');
    }

    if (typeof filter === 'function') {
        obj = filter(prefix, obj);
    } else if (obj instanceof Date) {
        obj = serializeDate(obj);
    } else if (generateArrayPrefix === 'comma' && isArray(obj)) {
        obj = utils.maybeMap(obj, function (value) {
            if (value instanceof Date) {
                return serializeDate(value);
            }
            return value;
        });
    }

    if (obj === null) {
        if (strictNullHandling) {
            return encoder && !encodeValuesOnly ? encoder(prefix, defaults.encoder, charset, 'key', format) : prefix;
        }

        obj = '';
    }

    if (isNonNullishPrimitive(obj) || utils.isBuffer(obj)) {
        if (encoder) {
            var keyValue = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, 'key', format);
            return [formatter(keyValue) + '=' + formatter(encoder(obj, defaults.encoder, charset, 'value', format))];
        }
        return [formatter(prefix) + '=' + formatter(String(obj))];
    }

    var values = [];

    if (typeof obj === 'undefined') {
        return values;
    }

    var objKeys;
    if (generateArrayPrefix === 'comma' && isArray(obj)) {
        // we need to join elements in
        objKeys = [{ value: obj.length > 0 ? obj.join(',') || null : undefined }];
    } else if (isArray(filter)) {
        objKeys = filter;
    } else {
        var keys = Object.keys(obj);
        objKeys = sort ? keys.sort(sort) : keys;
    }

    for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];
        var value = typeof key === 'object' && key.value !== undefined ? key.value : obj[key];

        if (skipNulls && value === null) {
            continue;
        }

        var keyPrefix = isArray(obj)
            ? typeof generateArrayPrefix === 'function' ? generateArrayPrefix(prefix, key) : prefix
            : prefix + (allowDots ? '.' + key : '[' + key + ']');

        sideChannel.set(object, true);
        var valueSideChannel = getSideChannel();
        pushToArray(values, stringify(
            value,
            keyPrefix,
            generateArrayPrefix,
            strictNullHandling,
            skipNulls,
            encoder,
            filter,
            sort,
            allowDots,
            serializeDate,
            format,
            formatter,
            encodeValuesOnly,
            charset,
            valueSideChannel
        ));
    }

    return values;
};

var normalizeStringifyOptions = function normalizeStringifyOptions(opts) {
    if (!opts) {
        return defaults;
    }

    if (opts.encoder !== null && opts.encoder !== undefined && typeof opts.encoder !== 'function') {
        throw new TypeError('Encoder has to be a function.');
    }

    var charset = opts.charset || defaults.charset;
    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }

    var format = formats['default'];
    if (typeof opts.format !== 'undefined') {
        if (!has.call(formats.formatters, opts.format)) {
            throw new TypeError('Unknown format option provided.');
        }
        format = opts.format;
    }
    var formatter = formats.formatters[format];

    var filter = defaults.filter;
    if (typeof opts.filter === 'function' || isArray(opts.filter)) {
        filter = opts.filter;
    }

    return {
        addQueryPrefix: typeof opts.addQueryPrefix === 'boolean' ? opts.addQueryPrefix : defaults.addQueryPrefix,
        allowDots: typeof opts.allowDots === 'undefined' ? defaults.allowDots : !!opts.allowDots,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        delimiter: typeof opts.delimiter === 'undefined' ? defaults.delimiter : opts.delimiter,
        encode: typeof opts.encode === 'boolean' ? opts.encode : defaults.encode,
        encoder: typeof opts.encoder === 'function' ? opts.encoder : defaults.encoder,
        encodeValuesOnly: typeof opts.encodeValuesOnly === 'boolean' ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
        filter: filter,
        format: format,
        formatter: formatter,
        serializeDate: typeof opts.serializeDate === 'function' ? opts.serializeDate : defaults.serializeDate,
        skipNulls: typeof opts.skipNulls === 'boolean' ? opts.skipNulls : defaults.skipNulls,
        sort: typeof opts.sort === 'function' ? opts.sort : null,
        strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
    };
};

module.exports = function (object, opts) {
    var obj = object;
    var options = normalizeStringifyOptions(opts);

    var objKeys;
    var filter;

    if (typeof options.filter === 'function') {
        filter = options.filter;
        obj = filter('', obj);
    } else if (isArray(options.filter)) {
        filter = options.filter;
        objKeys = filter;
    }

    var keys = [];

    if (typeof obj !== 'object' || obj === null) {
        return '';
    }

    var arrayFormat;
    if (opts && opts.arrayFormat in arrayPrefixGenerators) {
        arrayFormat = opts.arrayFormat;
    } else if (opts && 'indices' in opts) {
        arrayFormat = opts.indices ? 'indices' : 'repeat';
    } else {
        arrayFormat = 'indices';
    }

    var generateArrayPrefix = arrayPrefixGenerators[arrayFormat];

    if (!objKeys) {
        objKeys = Object.keys(obj);
    }

    if (options.sort) {
        objKeys.sort(options.sort);
    }

    var sideChannel = getSideChannel();
    for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];

        if (options.skipNulls && obj[key] === null) {
            continue;
        }
        pushToArray(keys, stringify(
            obj[key],
            key,
            generateArrayPrefix,
            options.strictNullHandling,
            options.skipNulls,
            options.encode ? options.encoder : null,
            options.filter,
            options.sort,
            options.allowDots,
            options.serializeDate,
            options.format,
            options.formatter,
            options.encodeValuesOnly,
            options.charset,
            sideChannel
        ));
    }

    var joined = keys.join(options.delimiter);
    var prefix = options.addQueryPrefix === true ? '?' : '';

    if (options.charsetSentinel) {
        if (options.charset === 'iso-8859-1') {
            // encodeURIComponent('&#10003;'), the "numeric entity" representation of a checkmark
            prefix += 'utf8=%26%2310003%3B&';
        } else {
            // encodeURIComponent('✓')
            prefix += 'utf8=%E2%9C%93&';
        }
    }

    return joined.length > 0 ? prefix + joined : '';
};

},{"./formats":24,"./utils":28,"side-channel":29}],28:[function(require,module,exports){
'use strict';

var formats = require('./formats');

var has = Object.prototype.hasOwnProperty;
var isArray = Array.isArray;

var hexTable = (function () {
    var array = [];
    for (var i = 0; i < 256; ++i) {
        array.push('%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase());
    }

    return array;
}());

var compactQueue = function compactQueue(queue) {
    while (queue.length > 1) {
        var item = queue.pop();
        var obj = item.obj[item.prop];

        if (isArray(obj)) {
            var compacted = [];

            for (var j = 0; j < obj.length; ++j) {
                if (typeof obj[j] !== 'undefined') {
                    compacted.push(obj[j]);
                }
            }

            item.obj[item.prop] = compacted;
        }
    }
};

var arrayToObject = function arrayToObject(source, options) {
    var obj = options && options.plainObjects ? Object.create(null) : {};
    for (var i = 0; i < source.length; ++i) {
        if (typeof source[i] !== 'undefined') {
            obj[i] = source[i];
        }
    }

    return obj;
};

var merge = function merge(target, source, options) {
    /* eslint no-param-reassign: 0 */
    if (!source) {
        return target;
    }

    if (typeof source !== 'object') {
        if (isArray(target)) {
            target.push(source);
        } else if (target && typeof target === 'object') {
            if ((options && (options.plainObjects || options.allowPrototypes)) || !has.call(Object.prototype, source)) {
                target[source] = true;
            }
        } else {
            return [target, source];
        }

        return target;
    }

    if (!target || typeof target !== 'object') {
        return [target].concat(source);
    }

    var mergeTarget = target;
    if (isArray(target) && !isArray(source)) {
        mergeTarget = arrayToObject(target, options);
    }

    if (isArray(target) && isArray(source)) {
        source.forEach(function (item, i) {
            if (has.call(target, i)) {
                var targetItem = target[i];
                if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
                    target[i] = merge(targetItem, item, options);
                } else {
                    target.push(item);
                }
            } else {
                target[i] = item;
            }
        });
        return target;
    }

    return Object.keys(source).reduce(function (acc, key) {
        var value = source[key];

        if (has.call(acc, key)) {
            acc[key] = merge(acc[key], value, options);
        } else {
            acc[key] = value;
        }
        return acc;
    }, mergeTarget);
};

var assign = function assignSingleSource(target, source) {
    return Object.keys(source).reduce(function (acc, key) {
        acc[key] = source[key];
        return acc;
    }, target);
};

var decode = function (str, decoder, charset) {
    var strWithoutPlus = str.replace(/\+/g, ' ');
    if (charset === 'iso-8859-1') {
        // unescape never throws, no try...catch needed:
        return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape);
    }
    // utf-8
    try {
        return decodeURIComponent(strWithoutPlus);
    } catch (e) {
        return strWithoutPlus;
    }
};

var encode = function encode(str, defaultEncoder, charset, kind, format) {
    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    var string = str;
    if (typeof str === 'symbol') {
        string = Symbol.prototype.toString.call(str);
    } else if (typeof str !== 'string') {
        string = String(str);
    }

    if (charset === 'iso-8859-1') {
        return escape(string).replace(/%u[0-9a-f]{4}/gi, function ($0) {
            return '%26%23' + parseInt($0.slice(2), 16) + '%3B';
        });
    }

    var out = '';
    for (var i = 0; i < string.length; ++i) {
        var c = string.charCodeAt(i);

        if (
            c === 0x2D // -
            || c === 0x2E // .
            || c === 0x5F // _
            || c === 0x7E // ~
            || (c >= 0x30 && c <= 0x39) // 0-9
            || (c >= 0x41 && c <= 0x5A) // a-z
            || (c >= 0x61 && c <= 0x7A) // A-Z
            || (format === formats.RFC1738 && (c === 0x28 || c === 0x29)) // ( )
        ) {
            out += string.charAt(i);
            continue;
        }

        if (c < 0x80) {
            out = out + hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out = out + (hexTable[0xC0 | (c >> 6)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        if (c < 0xD800 || c >= 0xE000) {
            out = out + (hexTable[0xE0 | (c >> 12)] + hexTable[0x80 | ((c >> 6) & 0x3F)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        i += 1;
        c = 0x10000 + (((c & 0x3FF) << 10) | (string.charCodeAt(i) & 0x3FF));
        out += hexTable[0xF0 | (c >> 18)]
            + hexTable[0x80 | ((c >> 12) & 0x3F)]
            + hexTable[0x80 | ((c >> 6) & 0x3F)]
            + hexTable[0x80 | (c & 0x3F)];
    }

    return out;
};

var compact = function compact(value) {
    var queue = [{ obj: { o: value }, prop: 'o' }];
    var refs = [];

    for (var i = 0; i < queue.length; ++i) {
        var item = queue[i];
        var obj = item.obj[item.prop];

        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; ++j) {
            var key = keys[j];
            var val = obj[key];
            if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
                queue.push({ obj: obj, prop: key });
                refs.push(val);
            }
        }
    }

    compactQueue(queue);

    return value;
};

var isRegExp = function isRegExp(obj) {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
};

var isBuffer = function isBuffer(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
};

var combine = function combine(a, b) {
    return [].concat(a, b);
};

var maybeMap = function maybeMap(val, fn) {
    if (isArray(val)) {
        var mapped = [];
        for (var i = 0; i < val.length; i += 1) {
            mapped.push(fn(val[i]));
        }
        return mapped;
    }
    return fn(val);
};

module.exports = {
    arrayToObject: arrayToObject,
    assign: assign,
    combine: combine,
    compact: compact,
    decode: decode,
    encode: encode,
    isBuffer: isBuffer,
    isRegExp: isRegExp,
    maybeMap: maybeMap,
    merge: merge
};

},{"./formats":24}],29:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');
var callBound = require('call-bind/callBound');
var inspect = require('object-inspect');

var $TypeError = GetIntrinsic('%TypeError%');
var $WeakMap = GetIntrinsic('%WeakMap%', true);
var $Map = GetIntrinsic('%Map%', true);

var $weakMapGet = callBound('WeakMap.prototype.get', true);
var $weakMapSet = callBound('WeakMap.prototype.set', true);
var $weakMapHas = callBound('WeakMap.prototype.has', true);
var $mapGet = callBound('Map.prototype.get', true);
var $mapSet = callBound('Map.prototype.set', true);
var $mapHas = callBound('Map.prototype.has', true);

/*
 * This function traverses the list returning the node corresponding to the
 * given key.
 *
 * That node is also moved to the head of the list, so that if it's accessed
 * again we don't need to traverse the whole list. By doing so, all the recently
 * used nodes can be accessed relatively quickly.
 */
var listGetNode = function (list, key) { // eslint-disable-line consistent-return
	for (var prev = list, curr; (curr = prev.next) !== null; prev = curr) {
		if (curr.key === key) {
			prev.next = curr.next;
			curr.next = list.next;
			list.next = curr; // eslint-disable-line no-param-reassign
			return curr;
		}
	}
};

var listGet = function (objects, key) {
	var node = listGetNode(objects, key);
	return node && node.value;
};
var listSet = function (objects, key, value) {
	var node = listGetNode(objects, key);
	if (node) {
		node.value = value;
	} else {
		// Prepend the new node to the beginning of the list
		objects.next = { // eslint-disable-line no-param-reassign
			key: key,
			next: objects.next,
			value: value
		};
	}
};
var listHas = function (objects, key) {
	return !!listGetNode(objects, key);
};

module.exports = function getSideChannel() {
	var $wm;
	var $m;
	var $o;
	var channel = {
		assert: function (key) {
			if (!channel.has(key)) {
				throw new $TypeError('Side channel does not contain ' + inspect(key));
			}
		},
		get: function (key) { // eslint-disable-line consistent-return
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if ($wm) {
					return $weakMapGet($wm, key);
				}
			} else if ($Map) {
				if ($m) {
					return $mapGet($m, key);
				}
			} else {
				if ($o) { // eslint-disable-line no-lonely-if
					return listGet($o, key);
				}
			}
		},
		has: function (key) {
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if ($wm) {
					return $weakMapHas($wm, key);
				}
			} else if ($Map) {
				if ($m) {
					return $mapHas($m, key);
				}
			} else {
				if ($o) { // eslint-disable-line no-lonely-if
					return listHas($o, key);
				}
			}
			return false;
		},
		set: function (key, value) {
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if (!$wm) {
					$wm = new $WeakMap();
				}
				$weakMapSet($wm, key, value);
			} else if ($Map) {
				if (!$m) {
					$m = new $Map();
				}
				$mapSet($m, key, value);
			} else {
				if (!$o) {
					/*
					 * Initialize the linked list as an empty node, so that we don't have
					 * to special-case handling of the first node: we can always refer to
					 * it as (previous node).next, instead of something like (list).head
					 */
					$o = { key: {}, next: null };
				}
				listSet($o, key, value);
			}
		}
	};
	return channel;
};

},{"call-bind/callBound":6,"get-intrinsic":14,"object-inspect":22}],30:[function(require,module,exports){
"use strict";

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _iterableToArray(iter) { if (typeof Symbol !== "undefined" && Symbol.iterator in Object(iter)) return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) return _arrayLikeToArray(arr); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function Agent() {
  this._defaults = [];
}

['use', 'on', 'once', 'set', 'query', 'type', 'accept', 'auth', 'withCredentials', 'sortQuery', 'retry', 'ok', 'redirects', 'timeout', 'buffer', 'serialize', 'parse', 'ca', 'key', 'pfx', 'cert', 'disableTLSCerts'].forEach(function (fn) {
  // Default setting for all requests from this agent
  Agent.prototype[fn] = function () {
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    this._defaults.push({
      fn: fn,
      args: args
    });

    return this;
  };
});

Agent.prototype._setDefaults = function (req) {
  this._defaults.forEach(function (def) {
    req[def.fn].apply(req, _toConsumableArray(def.args));
  });
};

module.exports = Agent;

},{}],31:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/**
 * Root reference for iframes.
 */
var root;

if (typeof window !== 'undefined') {
  // Browser window
  root = window;
} else if (typeof self === 'undefined') {
  // Other environments
  console.warn('Using browser-only version of superagent in non-browser environment');
  root = void 0;
} else {
  // Web Worker
  root = self;
}

var Emitter = require('component-emitter');

var safeStringify = require('fast-safe-stringify');

var qs = require('qs');

var RequestBase = require('./request-base');

var isObject = require('./is-object');

var ResponseBase = require('./response-base');

var Agent = require('./agent-base');
/**
 * Noop.
 */


function noop() {}
/**
 * Expose `request`.
 */


module.exports = function (method, url) {
  // callback
  if (typeof url === 'function') {
    return new exports.Request('GET', method).end(url);
  } // url first


  if (arguments.length === 1) {
    return new exports.Request('GET', method);
  }

  return new exports.Request(method, url);
};

exports = module.exports;
var request = exports;
exports.Request = Request;
/**
 * Determine XHR.
 */

request.getXHR = function () {
  if (root.XMLHttpRequest && (!root.location || root.location.protocol !== 'file:' || !root.ActiveXObject)) {
    return new XMLHttpRequest();
  }

  try {
    return new ActiveXObject('Microsoft.XMLHTTP');
  } catch (_unused) {}

  try {
    return new ActiveXObject('Msxml2.XMLHTTP.6.0');
  } catch (_unused2) {}

  try {
    return new ActiveXObject('Msxml2.XMLHTTP.3.0');
  } catch (_unused3) {}

  try {
    return new ActiveXObject('Msxml2.XMLHTTP');
  } catch (_unused4) {}

  throw new Error('Browser-only version of superagent could not find XHR');
};
/**
 * Removes leading and trailing whitespace, added to support IE.
 *
 * @param {String} s
 * @return {String}
 * @api private
 */


var trim = ''.trim ? function (s) {
  return s.trim();
} : function (s) {
  return s.replace(/(^\s*|\s*$)/g, '');
};
/**
 * Serialize the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api private
 */

function serialize(obj) {
  if (!isObject(obj)) return obj;
  var pairs = [];

  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) pushEncodedKeyValuePair(pairs, key, obj[key]);
  }

  return pairs.join('&');
}
/**
 * Helps 'serialize' with serializing arrays.
 * Mutates the pairs array.
 *
 * @param {Array} pairs
 * @param {String} key
 * @param {Mixed} val
 */


function pushEncodedKeyValuePair(pairs, key, val) {
  if (val === undefined) return;

  if (val === null) {
    pairs.push(encodeURI(key));
    return;
  }

  if (Array.isArray(val)) {
    val.forEach(function (v) {
      pushEncodedKeyValuePair(pairs, key, v);
    });
  } else if (isObject(val)) {
    for (var subkey in val) {
      if (Object.prototype.hasOwnProperty.call(val, subkey)) pushEncodedKeyValuePair(pairs, "".concat(key, "[").concat(subkey, "]"), val[subkey]);
    }
  } else {
    pairs.push(encodeURI(key) + '=' + encodeURIComponent(val));
  }
}
/**
 * Expose serialization method.
 */


request.serializeObject = serialize;
/**
 * Parse the given x-www-form-urlencoded `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseString(str) {
  var obj = {};
  var pairs = str.split('&');
  var pair;
  var pos;

  for (var i = 0, len = pairs.length; i < len; ++i) {
    pair = pairs[i];
    pos = pair.indexOf('=');

    if (pos === -1) {
      obj[decodeURIComponent(pair)] = '';
    } else {
      obj[decodeURIComponent(pair.slice(0, pos))] = decodeURIComponent(pair.slice(pos + 1));
    }
  }

  return obj;
}
/**
 * Expose parser.
 */


request.parseString = parseString;
/**
 * Default MIME type map.
 *
 *     superagent.types.xml = 'application/xml';
 *
 */

request.types = {
  html: 'text/html',
  json: 'application/json',
  xml: 'text/xml',
  urlencoded: 'application/x-www-form-urlencoded',
  form: 'application/x-www-form-urlencoded',
  'form-data': 'application/x-www-form-urlencoded'
};
/**
 * Default serialization map.
 *
 *     superagent.serialize['application/xml'] = function(obj){
 *       return 'generated xml here';
 *     };
 *
 */

request.serialize = {
  'application/x-www-form-urlencoded': qs.stringify,
  'application/json': safeStringify
};
/**
 * Default parsers.
 *
 *     superagent.parse['application/xml'] = function(str){
 *       return { object parsed from str };
 *     };
 *
 */

request.parse = {
  'application/x-www-form-urlencoded': parseString,
  'application/json': JSON.parse
};
/**
 * Parse the given header `str` into
 * an object containing the mapped fields.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseHeader(str) {
  var lines = str.split(/\r?\n/);
  var fields = {};
  var index;
  var line;
  var field;
  var val;

  for (var i = 0, len = lines.length; i < len; ++i) {
    line = lines[i];
    index = line.indexOf(':');

    if (index === -1) {
      // could be empty line, just skip it
      continue;
    }

    field = line.slice(0, index).toLowerCase();
    val = trim(line.slice(index + 1));
    fields[field] = val;
  }

  return fields;
}
/**
 * Check if `mime` is json or has +json structured syntax suffix.
 *
 * @param {String} mime
 * @return {Boolean}
 * @api private
 */


function isJSON(mime) {
  // should match /json or +json
  // but not /json-seq
  return /[/+]json($|[^-\w])/i.test(mime);
}
/**
 * Initialize a new `Response` with the given `xhr`.
 *
 *  - set flags (.ok, .error, etc)
 *  - parse header
 *
 * Examples:
 *
 *  Aliasing `superagent` as `request` is nice:
 *
 *      request = superagent;
 *
 *  We can use the promise-like API, or pass callbacks:
 *
 *      request.get('/').end(function(res){});
 *      request.get('/', function(res){});
 *
 *  Sending data can be chained:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' })
 *        .end(function(res){});
 *
 *  Or passed to `.send()`:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' }, function(res){});
 *
 *  Or passed to `.post()`:
 *
 *      request
 *        .post('/user', { name: 'tj' })
 *        .end(function(res){});
 *
 * Or further reduced to a single call for simple cases:
 *
 *      request
 *        .post('/user', { name: 'tj' }, function(res){});
 *
 * @param {XMLHTTPRequest} xhr
 * @param {Object} options
 * @api private
 */


function Response(req) {
  this.req = req;
  this.xhr = this.req.xhr; // responseText is accessible only if responseType is '' or 'text' and on older browsers

  this.text = this.req.method !== 'HEAD' && (this.xhr.responseType === '' || this.xhr.responseType === 'text') || typeof this.xhr.responseType === 'undefined' ? this.xhr.responseText : null;
  this.statusText = this.req.xhr.statusText;
  var status = this.xhr.status; // handle IE9 bug: http://stackoverflow.com/questions/10046972/msie-returns-status-code-of-1223-for-ajax-request

  if (status === 1223) {
    status = 204;
  }

  this._setStatusProperties(status);

  this.headers = parseHeader(this.xhr.getAllResponseHeaders());
  this.header = this.headers; // getAllResponseHeaders sometimes falsely returns "" for CORS requests, but
  // getResponseHeader still works. so we get content-type even if getting
  // other headers fails.

  this.header['content-type'] = this.xhr.getResponseHeader('content-type');

  this._setHeaderProperties(this.header);

  if (this.text === null && req._responseType) {
    this.body = this.xhr.response;
  } else {
    this.body = this.req.method === 'HEAD' ? null : this._parseBody(this.text ? this.text : this.xhr.response);
  }
} // eslint-disable-next-line new-cap


ResponseBase(Response.prototype);
/**
 * Parse the given body `str`.
 *
 * Used for auto-parsing of bodies. Parsers
 * are defined on the `superagent.parse` object.
 *
 * @param {String} str
 * @return {Mixed}
 * @api private
 */

Response.prototype._parseBody = function (str) {
  var parse = request.parse[this.type];

  if (this.req._parser) {
    return this.req._parser(this, str);
  }

  if (!parse && isJSON(this.type)) {
    parse = request.parse['application/json'];
  }

  return parse && str && (str.length > 0 || str instanceof Object) ? parse(str) : null;
};
/**
 * Return an `Error` representative of this response.
 *
 * @return {Error}
 * @api public
 */


Response.prototype.toError = function () {
  var req = this.req;
  var method = req.method;
  var url = req.url;
  var msg = "cannot ".concat(method, " ").concat(url, " (").concat(this.status, ")");
  var err = new Error(msg);
  err.status = this.status;
  err.method = method;
  err.url = url;
  return err;
};
/**
 * Expose `Response`.
 */


request.Response = Response;
/**
 * Initialize a new `Request` with the given `method` and `url`.
 *
 * @param {String} method
 * @param {String} url
 * @api public
 */

function Request(method, url) {
  var self = this;
  this._query = this._query || [];
  this.method = method;
  this.url = url;
  this.header = {}; // preserves header name case

  this._header = {}; // coerces header names to lowercase

  this.on('end', function () {
    var err = null;
    var res = null;

    try {
      res = new Response(self);
    } catch (err_) {
      err = new Error('Parser is unable to parse the response');
      err.parse = true;
      err.original = err_; // issue #675: return the raw response if the response parsing fails

      if (self.xhr) {
        // ie9 doesn't have 'response' property
        err.rawResponse = typeof self.xhr.responseType === 'undefined' ? self.xhr.responseText : self.xhr.response; // issue #876: return the http status code if the response parsing fails

        err.status = self.xhr.status ? self.xhr.status : null;
        err.statusCode = err.status; // backwards-compat only
      } else {
        err.rawResponse = null;
        err.status = null;
      }

      return self.callback(err);
    }

    self.emit('response', res);
    var new_err;

    try {
      if (!self._isResponseOK(res)) {
        new_err = new Error(res.statusText || res.text || 'Unsuccessful HTTP response');
      }
    } catch (err_) {
      new_err = err_; // ok() callback can throw
    } // #1000 don't catch errors from the callback to avoid double calling it


    if (new_err) {
      new_err.original = err;
      new_err.response = res;
      new_err.status = res.status;
      self.callback(new_err, res);
    } else {
      self.callback(null, res);
    }
  });
}
/**
 * Mixin `Emitter` and `RequestBase`.
 */
// eslint-disable-next-line new-cap


Emitter(Request.prototype); // eslint-disable-next-line new-cap

RequestBase(Request.prototype);
/**
 * Set Content-Type to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.xml = 'application/xml';
 *
 *      request.post('/')
 *        .type('xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 *      request.post('/')
 *        .type('application/xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 * @param {String} type
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.type = function (type) {
  this.set('Content-Type', request.types[type] || type);
  return this;
};
/**
 * Set Accept to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.json = 'application/json';
 *
 *      request.get('/agent')
 *        .accept('json')
 *        .end(callback);
 *
 *      request.get('/agent')
 *        .accept('application/json')
 *        .end(callback);
 *
 * @param {String} accept
 * @return {Request} for chaining
 * @api public
 */


Request.prototype.accept = function (type) {
  this.set('Accept', request.types[type] || type);
  return this;
};
/**
 * Set Authorization field value with `user` and `pass`.
 *
 * @param {String} user
 * @param {String} [pass] optional in case of using 'bearer' as type
 * @param {Object} options with 'type' property 'auto', 'basic' or 'bearer' (default 'basic')
 * @return {Request} for chaining
 * @api public
 */


Request.prototype.auth = function (user, pass, options) {
  if (arguments.length === 1) pass = '';

  if (_typeof(pass) === 'object' && pass !== null) {
    // pass is optional and can be replaced with options
    options = pass;
    pass = '';
  }

  if (!options) {
    options = {
      type: typeof btoa === 'function' ? 'basic' : 'auto'
    };
  }

  var encoder = function encoder(string) {
    if (typeof btoa === 'function') {
      return btoa(string);
    }

    throw new Error('Cannot use basic auth, btoa is not a function');
  };

  return this._auth(user, pass, options, encoder);
};
/**
 * Add query-string `val`.
 *
 * Examples:
 *
 *   request.get('/shoes')
 *     .query('size=10')
 *     .query({ color: 'blue' })
 *
 * @param {Object|String} val
 * @return {Request} for chaining
 * @api public
 */


Request.prototype.query = function (val) {
  if (typeof val !== 'string') val = serialize(val);
  if (val) this._query.push(val);
  return this;
};
/**
 * Queue the given `file` as an attachment to the specified `field`,
 * with optional `options` (or filename).
 *
 * ``` js
 * request.post('/upload')
 *   .attach('content', new Blob(['<a id="a"><b id="b">hey!</b></a>'], { type: "text/html"}))
 *   .end(callback);
 * ```
 *
 * @param {String} field
 * @param {Blob|File} file
 * @param {String|Object} options
 * @return {Request} for chaining
 * @api public
 */


Request.prototype.attach = function (field, file, options) {
  if (file) {
    if (this._data) {
      throw new Error("superagent can't mix .send() and .attach()");
    }

    this._getFormData().append(field, file, options || file.name);
  }

  return this;
};

Request.prototype._getFormData = function () {
  if (!this._formData) {
    this._formData = new root.FormData();
  }

  return this._formData;
};
/**
 * Invoke the callback with `err` and `res`
 * and handle arity check.
 *
 * @param {Error} err
 * @param {Response} res
 * @api private
 */


Request.prototype.callback = function (err, res) {
  if (this._shouldRetry(err, res)) {
    return this._retry();
  }

  var fn = this._callback;
  this.clearTimeout();

  if (err) {
    if (this._maxRetries) err.retries = this._retries - 1;
    this.emit('error', err);
  }

  fn(err, res);
};
/**
 * Invoke callback with x-domain error.
 *
 * @api private
 */


Request.prototype.crossDomainError = function () {
  var err = new Error('Request has been terminated\nPossible causes: the network is offline, Origin is not allowed by Access-Control-Allow-Origin, the page is being unloaded, etc.');
  err.crossDomain = true;
  err.status = this.status;
  err.method = this.method;
  err.url = this.url;
  this.callback(err);
}; // This only warns, because the request is still likely to work


Request.prototype.agent = function () {
  console.warn('This is not supported in browser version of superagent');
  return this;
};

Request.prototype.ca = Request.prototype.agent;
Request.prototype.buffer = Request.prototype.ca; // This throws, because it can't send/receive data as expected

Request.prototype.write = function () {
  throw new Error('Streaming is not supported in browser version of superagent');
};

Request.prototype.pipe = Request.prototype.write;
/**
 * Check if `obj` is a host object,
 * we don't want to serialize these :)
 *
 * @param {Object} obj host object
 * @return {Boolean} is a host object
 * @api private
 */

Request.prototype._isHost = function (obj) {
  // Native objects stringify to [object File], [object Blob], [object FormData], etc.
  return obj && _typeof(obj) === 'object' && !Array.isArray(obj) && Object.prototype.toString.call(obj) !== '[object Object]';
};
/**
 * Initiate request, invoking callback `fn(res)`
 * with an instanceof `Response`.
 *
 * @param {Function} fn
 * @return {Request} for chaining
 * @api public
 */


Request.prototype.end = function (fn) {
  if (this._endCalled) {
    console.warn('Warning: .end() was called twice. This is not supported in superagent');
  }

  this._endCalled = true; // store callback

  this._callback = fn || noop; // querystring

  this._finalizeQueryString();

  this._end();
};

Request.prototype._setUploadTimeout = function () {
  var self = this; // upload timeout it's wokrs only if deadline timeout is off

  if (this._uploadTimeout && !this._uploadTimeoutTimer) {
    this._uploadTimeoutTimer = setTimeout(function () {
      self._timeoutError('Upload timeout of ', self._uploadTimeout, 'ETIMEDOUT');
    }, this._uploadTimeout);
  }
}; // eslint-disable-next-line complexity


Request.prototype._end = function () {
  if (this._aborted) return this.callback(new Error('The request has been aborted even before .end() was called'));
  var self = this;
  this.xhr = request.getXHR();
  var xhr = this.xhr;
  var data = this._formData || this._data;

  this._setTimeouts(); // state change


  xhr.onreadystatechange = function () {
    var readyState = xhr.readyState;

    if (readyState >= 2 && self._responseTimeoutTimer) {
      clearTimeout(self._responseTimeoutTimer);
    }

    if (readyState !== 4) {
      return;
    } // In IE9, reads to any property (e.g. status) off of an aborted XHR will
    // result in the error "Could not complete the operation due to error c00c023f"


    var status;

    try {
      status = xhr.status;
    } catch (_unused5) {
      status = 0;
    }

    if (!status) {
      if (self.timedout || self._aborted) return;
      return self.crossDomainError();
    }

    self.emit('end');
  }; // progress


  var handleProgress = function handleProgress(direction, e) {
    if (e.total > 0) {
      e.percent = e.loaded / e.total * 100;

      if (e.percent === 100) {
        clearTimeout(self._uploadTimeoutTimer);
      }
    }

    e.direction = direction;
    self.emit('progress', e);
  };

  if (this.hasListeners('progress')) {
    try {
      xhr.addEventListener('progress', handleProgress.bind(null, 'download'));

      if (xhr.upload) {
        xhr.upload.addEventListener('progress', handleProgress.bind(null, 'upload'));
      }
    } catch (_unused6) {// Accessing xhr.upload fails in IE from a web worker, so just pretend it doesn't exist.
      // Reported here:
      // https://connect.microsoft.com/IE/feedback/details/837245/xmlhttprequest-upload-throws-invalid-argument-when-used-from-web-worker-context
    }
  }

  if (xhr.upload) {
    this._setUploadTimeout();
  } // initiate request


  try {
    if (this.username && this.password) {
      xhr.open(this.method, this.url, true, this.username, this.password);
    } else {
      xhr.open(this.method, this.url, true);
    }
  } catch (err) {
    // see #1149
    return this.callback(err);
  } // CORS


  if (this._withCredentials) xhr.withCredentials = true; // body

  if (!this._formData && this.method !== 'GET' && this.method !== 'HEAD' && typeof data !== 'string' && !this._isHost(data)) {
    // serialize stuff
    var contentType = this._header['content-type'];

    var _serialize = this._serializer || request.serialize[contentType ? contentType.split(';')[0] : ''];

    if (!_serialize && isJSON(contentType)) {
      _serialize = request.serialize['application/json'];
    }

    if (_serialize) data = _serialize(data);
  } // set header fields


  for (var field in this.header) {
    if (this.header[field] === null) continue;
    if (Object.prototype.hasOwnProperty.call(this.header, field)) xhr.setRequestHeader(field, this.header[field]);
  }

  if (this._responseType) {
    xhr.responseType = this._responseType;
  } // send stuff


  this.emit('request', this); // IE11 xhr.send(undefined) sends 'undefined' string as POST payload (instead of nothing)
  // We need null here if data is undefined

  xhr.send(typeof data === 'undefined' ? null : data);
};

request.agent = function () {
  return new Agent();
};

['GET', 'POST', 'OPTIONS', 'PATCH', 'PUT', 'DELETE'].forEach(function (method) {
  Agent.prototype[method.toLowerCase()] = function (url, fn) {
    var req = new request.Request(method, url);

    this._setDefaults(req);

    if (fn) {
      req.end(fn);
    }

    return req;
  };
});
Agent.prototype.del = Agent.prototype.delete;
/**
 * GET `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.get = function (url, data, fn) {
  var req = request('GET', url);

  if (typeof data === 'function') {
    fn = data;
    data = null;
  }

  if (data) req.query(data);
  if (fn) req.end(fn);
  return req;
};
/**
 * HEAD `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */


request.head = function (url, data, fn) {
  var req = request('HEAD', url);

  if (typeof data === 'function') {
    fn = data;
    data = null;
  }

  if (data) req.query(data);
  if (fn) req.end(fn);
  return req;
};
/**
 * OPTIONS query to `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */


request.options = function (url, data, fn) {
  var req = request('OPTIONS', url);

  if (typeof data === 'function') {
    fn = data;
    data = null;
  }

  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};
/**
 * DELETE `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */


function del(url, data, fn) {
  var req = request('DELETE', url);

  if (typeof data === 'function') {
    fn = data;
    data = null;
  }

  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
}

request.del = del;
request.delete = del;
/**
 * PATCH `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.patch = function (url, data, fn) {
  var req = request('PATCH', url);

  if (typeof data === 'function') {
    fn = data;
    data = null;
  }

  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};
/**
 * POST `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */


request.post = function (url, data, fn) {
  var req = request('POST', url);

  if (typeof data === 'function') {
    fn = data;
    data = null;
  }

  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};
/**
 * PUT `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */


request.put = function (url, data, fn) {
  var req = request('PUT', url);

  if (typeof data === 'function') {
    fn = data;
    data = null;
  }

  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

},{"./agent-base":30,"./is-object":32,"./request-base":33,"./response-base":34,"component-emitter":8,"fast-safe-stringify":10,"qs":25}],32:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/**
 * Check if `obj` is an object.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */
function isObject(obj) {
  return obj !== null && _typeof(obj) === 'object';
}

module.exports = isObject;

},{}],33:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/**
 * Module of mixed-in functions shared between node and client code
 */
var isObject = require('./is-object');
/**
 * Expose `RequestBase`.
 */


module.exports = RequestBase;
/**
 * Initialize a new `RequestBase`.
 *
 * @api public
 */

function RequestBase(object) {
  if (object) return mixin(object);
}
/**
 * Mixin the prototype properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */


function mixin(object) {
  for (var key in RequestBase.prototype) {
    if (Object.prototype.hasOwnProperty.call(RequestBase.prototype, key)) object[key] = RequestBase.prototype[key];
  }

  return object;
}
/**
 * Clear previous timeout.
 *
 * @return {Request} for chaining
 * @api public
 */


RequestBase.prototype.clearTimeout = function () {
  clearTimeout(this._timer);
  clearTimeout(this._responseTimeoutTimer);
  clearTimeout(this._uploadTimeoutTimer);
  delete this._timer;
  delete this._responseTimeoutTimer;
  delete this._uploadTimeoutTimer;
  return this;
};
/**
 * Override default response body parser
 *
 * This function will be called to convert incoming data into request.body
 *
 * @param {Function}
 * @api public
 */


RequestBase.prototype.parse = function (fn) {
  this._parser = fn;
  return this;
};
/**
 * Set format of binary response body.
 * In browser valid formats are 'blob' and 'arraybuffer',
 * which return Blob and ArrayBuffer, respectively.
 *
 * In Node all values result in Buffer.
 *
 * Examples:
 *
 *      req.get('/')
 *        .responseType('blob')
 *        .end(callback);
 *
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */


RequestBase.prototype.responseType = function (value) {
  this._responseType = value;
  return this;
};
/**
 * Override default request body serializer
 *
 * This function will be called to convert data set via .send or .attach into payload to send
 *
 * @param {Function}
 * @api public
 */


RequestBase.prototype.serialize = function (fn) {
  this._serializer = fn;
  return this;
};
/**
 * Set timeouts.
 *
 * - response timeout is time between sending request and receiving the first byte of the response. Includes DNS and connection time.
 * - deadline is the time from start of the request to receiving response body in full. If the deadline is too short large files may not load at all on slow connections.
 * - upload is the time  since last bit of data was sent or received. This timeout works only if deadline timeout is off
 *
 * Value of 0 or false means no timeout.
 *
 * @param {Number|Object} ms or {response, deadline}
 * @return {Request} for chaining
 * @api public
 */


RequestBase.prototype.timeout = function (options) {
  if (!options || _typeof(options) !== 'object') {
    this._timeout = options;
    this._responseTimeout = 0;
    this._uploadTimeout = 0;
    return this;
  }

  for (var option in options) {
    if (Object.prototype.hasOwnProperty.call(options, option)) {
      switch (option) {
        case 'deadline':
          this._timeout = options.deadline;
          break;

        case 'response':
          this._responseTimeout = options.response;
          break;

        case 'upload':
          this._uploadTimeout = options.upload;
          break;

        default:
          console.warn('Unknown timeout option', option);
      }
    }
  }

  return this;
};
/**
 * Set number of retry attempts on error.
 *
 * Failed requests will be retried 'count' times if timeout or err.code >= 500.
 *
 * @param {Number} count
 * @param {Function} [fn]
 * @return {Request} for chaining
 * @api public
 */


RequestBase.prototype.retry = function (count, fn) {
  // Default to 1 if no count passed or true
  if (arguments.length === 0 || count === true) count = 1;
  if (count <= 0) count = 0;
  this._maxRetries = count;
  this._retries = 0;
  this._retryCallback = fn;
  return this;
}; //
// NOTE: we do not include ESOCKETTIMEDOUT because that is from `request` package
//       <https://github.com/sindresorhus/got/pull/537>
//
// NOTE: we do not include EADDRINFO because it was removed from libuv in 2014
//       <https://github.com/libuv/libuv/commit/02e1ebd40b807be5af46343ea873331b2ee4e9c1>
//       <https://github.com/request/request/search?q=ESOCKETTIMEDOUT&unscoped_q=ESOCKETTIMEDOUT>
//
//
// TODO: expose these as configurable defaults
//


var ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EADDRINUSE', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN']);
var STATUS_CODES = new Set([408, 413, 429, 500, 502, 503, 504, 521, 522, 524]); // TODO: we would need to make this easily configurable before adding it in (e.g. some might want to add POST)
// const METHODS = new Set(['GET', 'PUT', 'HEAD', 'DELETE', 'OPTIONS', 'TRACE']);

/**
 * Determine if a request should be retried.
 * (Inspired by https://github.com/sindresorhus/got#retry)
 *
 * @param {Error} err an error
 * @param {Response} [res] response
 * @returns {Boolean} if segment should be retried
 */

RequestBase.prototype._shouldRetry = function (err, res) {
  if (!this._maxRetries || this._retries++ >= this._maxRetries) {
    return false;
  }

  if (this._retryCallback) {
    try {
      var override = this._retryCallback(err, res);

      if (override === true) return true;
      if (override === false) return false; // undefined falls back to defaults
    } catch (err_) {
      console.error(err_);
    }
  } // TODO: we would need to make this easily configurable before adding it in (e.g. some might want to add POST)

  /*
  if (
    this.req &&
    this.req.method &&
    !METHODS.has(this.req.method.toUpperCase())
  )
    return false;
  */


  if (res && res.status && STATUS_CODES.has(res.status)) return true;

  if (err) {
    if (err.code && ERROR_CODES.has(err.code)) return true; // Superagent timeout

    if (err.timeout && err.code === 'ECONNABORTED') return true;
    if (err.crossDomain) return true;
  }

  return false;
};
/**
 * Retry request
 *
 * @return {Request} for chaining
 * @api private
 */


RequestBase.prototype._retry = function () {
  this.clearTimeout(); // node

  if (this.req) {
    this.req = null;
    this.req = this.request();
  }

  this._aborted = false;
  this.timedout = false;
  this.timedoutError = null;
  return this._end();
};
/**
 * Promise support
 *
 * @param {Function} resolve
 * @param {Function} [reject]
 * @return {Request}
 */


RequestBase.prototype.then = function (resolve, reject) {
  var _this = this;

  if (!this._fullfilledPromise) {
    var self = this;

    if (this._endCalled) {
      console.warn('Warning: superagent request was sent twice, because both .end() and .then() were called. Never call .end() if you use promises');
    }

    this._fullfilledPromise = new Promise(function (resolve, reject) {
      self.on('abort', function () {
        if (_this._maxRetries && _this._maxRetries > _this._retries) {
          return;
        }

        if (_this.timedout && _this.timedoutError) {
          reject(_this.timedoutError);
          return;
        }

        var err = new Error('Aborted');
        err.code = 'ABORTED';
        err.status = _this.status;
        err.method = _this.method;
        err.url = _this.url;
        reject(err);
      });
      self.end(function (err, res) {
        if (err) reject(err);else resolve(res);
      });
    });
  }

  return this._fullfilledPromise.then(resolve, reject);
};

RequestBase.prototype.catch = function (cb) {
  return this.then(undefined, cb);
};
/**
 * Allow for extension
 */


RequestBase.prototype.use = function (fn) {
  fn(this);
  return this;
};

RequestBase.prototype.ok = function (cb) {
  if (typeof cb !== 'function') throw new Error('Callback required');
  this._okCallback = cb;
  return this;
};

RequestBase.prototype._isResponseOK = function (res) {
  if (!res) {
    return false;
  }

  if (this._okCallback) {
    return this._okCallback(res);
  }

  return res.status >= 200 && res.status < 300;
};
/**
 * Get request header `field`.
 * Case-insensitive.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */


RequestBase.prototype.get = function (field) {
  return this._header[field.toLowerCase()];
};
/**
 * Get case-insensitive header `field` value.
 * This is a deprecated internal API. Use `.get(field)` instead.
 *
 * (getHeader is no longer used internally by the superagent code base)
 *
 * @param {String} field
 * @return {String}
 * @api private
 * @deprecated
 */


RequestBase.prototype.getHeader = RequestBase.prototype.get;
/**
 * Set header `field` to `val`, or multiple fields with one object.
 * Case-insensitive.
 *
 * Examples:
 *
 *      req.get('/')
 *        .set('Accept', 'application/json')
 *        .set('X-API-Key', 'foobar')
 *        .end(callback);
 *
 *      req.get('/')
 *        .set({ Accept: 'application/json', 'X-API-Key': 'foobar' })
 *        .end(callback);
 *
 * @param {String|Object} field
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.set = function (field, value) {
  if (isObject(field)) {
    for (var key in field) {
      if (Object.prototype.hasOwnProperty.call(field, key)) this.set(key, field[key]);
    }

    return this;
  }

  this._header[field.toLowerCase()] = value;
  this.header[field] = value;
  return this;
};
/**
 * Remove header `field`.
 * Case-insensitive.
 *
 * Example:
 *
 *      req.get('/')
 *        .unset('User-Agent')
 *        .end(callback);
 *
 * @param {String} field field name
 */


RequestBase.prototype.unset = function (field) {
  delete this._header[field.toLowerCase()];
  delete this.header[field];
  return this;
};
/**
 * Write the field `name` and `val`, or multiple fields with one object
 * for "multipart/form-data" request bodies.
 *
 * ``` js
 * request.post('/upload')
 *   .field('foo', 'bar')
 *   .end(callback);
 *
 * request.post('/upload')
 *   .field({ foo: 'bar', baz: 'qux' })
 *   .end(callback);
 * ```
 *
 * @param {String|Object} name name of field
 * @param {String|Blob|File|Buffer|fs.ReadStream} val value of field
 * @return {Request} for chaining
 * @api public
 */


RequestBase.prototype.field = function (name, value) {
  // name should be either a string or an object.
  if (name === null || undefined === name) {
    throw new Error('.field(name, val) name can not be empty');
  }

  if (this._data) {
    throw new Error(".field() can't be used if .send() is used. Please use only .send() or only .field() & .attach()");
  }

  if (isObject(name)) {
    for (var key in name) {
      if (Object.prototype.hasOwnProperty.call(name, key)) this.field(key, name[key]);
    }

    return this;
  }

  if (Array.isArray(value)) {
    for (var i in value) {
      if (Object.prototype.hasOwnProperty.call(value, i)) this.field(name, value[i]);
    }

    return this;
  } // val should be defined now


  if (value === null || undefined === value) {
    throw new Error('.field(name, val) val can not be empty');
  }

  if (typeof value === 'boolean') {
    value = String(value);
  }

  this._getFormData().append(name, value);

  return this;
};
/**
 * Abort the request, and clear potential timeout.
 *
 * @return {Request} request
 * @api public
 */


RequestBase.prototype.abort = function () {
  if (this._aborted) {
    return this;
  }

  this._aborted = true;
  if (this.xhr) this.xhr.abort(); // browser

  if (this.req) this.req.abort(); // node

  this.clearTimeout();
  this.emit('abort');
  return this;
};

RequestBase.prototype._auth = function (user, pass, options, base64Encoder) {
  switch (options.type) {
    case 'basic':
      this.set('Authorization', "Basic ".concat(base64Encoder("".concat(user, ":").concat(pass))));
      break;

    case 'auto':
      this.username = user;
      this.password = pass;
      break;

    case 'bearer':
      // usage would be .auth(accessToken, { type: 'bearer' })
      this.set('Authorization', "Bearer ".concat(user));
      break;

    default:
      break;
  }

  return this;
};
/**
 * Enable transmission of cookies with x-domain requests.
 *
 * Note that for this to work the origin must not be
 * using "Access-Control-Allow-Origin" with a wildcard,
 * and also must set "Access-Control-Allow-Credentials"
 * to "true".
 *
 * @api public
 */


RequestBase.prototype.withCredentials = function (on) {
  // This is browser-only functionality. Node side is no-op.
  if (on === undefined) on = true;
  this._withCredentials = on;
  return this;
};
/**
 * Set the max redirects to `n`. Does nothing in browser XHR implementation.
 *
 * @param {Number} n
 * @return {Request} for chaining
 * @api public
 */


RequestBase.prototype.redirects = function (n) {
  this._maxRedirects = n;
  return this;
};
/**
 * Maximum size of buffered response body, in bytes. Counts uncompressed size.
 * Default 200MB.
 *
 * @param {Number} n number of bytes
 * @return {Request} for chaining
 */


RequestBase.prototype.maxResponseSize = function (n) {
  if (typeof n !== 'number') {
    throw new TypeError('Invalid argument');
  }

  this._maxResponseSize = n;
  return this;
};
/**
 * Convert to a plain javascript object (not JSON string) of scalar properties.
 * Note as this method is designed to return a useful non-this value,
 * it cannot be chained.
 *
 * @return {Object} describing method, url, and data of this request
 * @api public
 */


RequestBase.prototype.toJSON = function () {
  return {
    method: this.method,
    url: this.url,
    data: this._data,
    headers: this._header
  };
};
/**
 * Send `data` as the request body, defaulting the `.type()` to "json" when
 * an object is given.
 *
 * Examples:
 *
 *       // manual json
 *       request.post('/user')
 *         .type('json')
 *         .send('{"name":"tj"}')
 *         .end(callback)
 *
 *       // auto json
 *       request.post('/user')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // manual x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send('name=tj')
 *         .end(callback)
 *
 *       // auto x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // defaults to x-www-form-urlencoded
 *      request.post('/user')
 *        .send('name=tobi')
 *        .send('species=ferret')
 *        .end(callback)
 *
 * @param {String|Object} data
 * @return {Request} for chaining
 * @api public
 */
// eslint-disable-next-line complexity


RequestBase.prototype.send = function (data) {
  var isObject_ = isObject(data);
  var type = this._header['content-type'];

  if (this._formData) {
    throw new Error(".send() can't be used if .attach() or .field() is used. Please use only .send() or only .field() & .attach()");
  }

  if (isObject_ && !this._data) {
    if (Array.isArray(data)) {
      this._data = [];
    } else if (!this._isHost(data)) {
      this._data = {};
    }
  } else if (data && this._data && this._isHost(this._data)) {
    throw new Error("Can't merge these send calls");
  } // merge


  if (isObject_ && isObject(this._data)) {
    for (var key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) this._data[key] = data[key];
    }
  } else if (typeof data === 'string') {
    // default to x-www-form-urlencoded
    if (!type) this.type('form');
    type = this._header['content-type'];
    if (type) type = type.toLowerCase().trim();

    if (type === 'application/x-www-form-urlencoded') {
      this._data = this._data ? "".concat(this._data, "&").concat(data) : data;
    } else {
      this._data = (this._data || '') + data;
    }
  } else {
    this._data = data;
  }

  if (!isObject_ || this._isHost(data)) {
    return this;
  } // default to json


  if (!type) this.type('json');
  return this;
};
/**
 * Sort `querystring` by the sort function
 *
 *
 * Examples:
 *
 *       // default order
 *       request.get('/user')
 *         .query('name=Nick')
 *         .query('search=Manny')
 *         .sortQuery()
 *         .end(callback)
 *
 *       // customized sort function
 *       request.get('/user')
 *         .query('name=Nick')
 *         .query('search=Manny')
 *         .sortQuery(function(a, b){
 *           return a.length - b.length;
 *         })
 *         .end(callback)
 *
 *
 * @param {Function} sort
 * @return {Request} for chaining
 * @api public
 */


RequestBase.prototype.sortQuery = function (sort) {
  // _sort default to true but otherwise can be a function or boolean
  this._sort = typeof sort === 'undefined' ? true : sort;
  return this;
};
/**
 * Compose querystring to append to req.url
 *
 * @api private
 */


RequestBase.prototype._finalizeQueryString = function () {
  var query = this._query.join('&');

  if (query) {
    this.url += (this.url.includes('?') ? '&' : '?') + query;
  }

  this._query.length = 0; // Makes the call idempotent

  if (this._sort) {
    var index = this.url.indexOf('?');

    if (index >= 0) {
      var queryArray = this.url.slice(index + 1).split('&');

      if (typeof this._sort === 'function') {
        queryArray.sort(this._sort);
      } else {
        queryArray.sort();
      }

      this.url = this.url.slice(0, index) + '?' + queryArray.join('&');
    }
  }
}; // For backwards compat only


RequestBase.prototype._appendQueryString = function () {
  console.warn('Unsupported');
};
/**
 * Invoke callback with timeout error.
 *
 * @api private
 */


RequestBase.prototype._timeoutError = function (reason, timeout, errno) {
  if (this._aborted) {
    return;
  }

  var err = new Error("".concat(reason + timeout, "ms exceeded"));
  err.timeout = timeout;
  err.code = 'ECONNABORTED';
  err.errno = errno;
  this.timedout = true;
  this.timedoutError = err;
  this.abort();
  this.callback(err);
};

RequestBase.prototype._setTimeouts = function () {
  var self = this; // deadline

  if (this._timeout && !this._timer) {
    this._timer = setTimeout(function () {
      self._timeoutError('Timeout of ', self._timeout, 'ETIME');
    }, this._timeout);
  } // response timeout


  if (this._responseTimeout && !this._responseTimeoutTimer) {
    this._responseTimeoutTimer = setTimeout(function () {
      self._timeoutError('Response timeout of ', self._responseTimeout, 'ETIMEDOUT');
    }, this._responseTimeout);
  }
};

},{"./is-object":32}],34:[function(require,module,exports){
"use strict";

/**
 * Module dependencies.
 */
var utils = require('./utils');
/**
 * Expose `ResponseBase`.
 */


module.exports = ResponseBase;
/**
 * Initialize a new `ResponseBase`.
 *
 * @api public
 */

function ResponseBase(obj) {
  if (obj) return mixin(obj);
}
/**
 * Mixin the prototype properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */


function mixin(obj) {
  for (var key in ResponseBase.prototype) {
    if (Object.prototype.hasOwnProperty.call(ResponseBase.prototype, key)) obj[key] = ResponseBase.prototype[key];
  }

  return obj;
}
/**
 * Get case-insensitive `field` value.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */


ResponseBase.prototype.get = function (field) {
  return this.header[field.toLowerCase()];
};
/**
 * Set header related properties:
 *
 *   - `.type` the content type without params
 *
 * A response of "Content-Type: text/plain; charset=utf-8"
 * will provide you with a `.type` of "text/plain".
 *
 * @param {Object} header
 * @api private
 */


ResponseBase.prototype._setHeaderProperties = function (header) {
  // TODO: moar!
  // TODO: make this a util
  // content-type
  var ct = header['content-type'] || '';
  this.type = utils.type(ct); // params

  var params = utils.params(ct);

  for (var key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) this[key] = params[key];
  }

  this.links = {}; // links

  try {
    if (header.link) {
      this.links = utils.parseLinks(header.link);
    }
  } catch (_unused) {// ignore
  }
};
/**
 * Set flags such as `.ok` based on `status`.
 *
 * For example a 2xx response will give you a `.ok` of __true__
 * whereas 5xx will be __false__ and `.error` will be __true__. The
 * `.clientError` and `.serverError` are also available to be more
 * specific, and `.statusType` is the class of error ranging from 1..5
 * sometimes useful for mapping respond colors etc.
 *
 * "sugar" properties are also defined for common cases. Currently providing:
 *
 *   - .noContent
 *   - .badRequest
 *   - .unauthorized
 *   - .notAcceptable
 *   - .notFound
 *
 * @param {Number} status
 * @api private
 */


ResponseBase.prototype._setStatusProperties = function (status) {
  var type = status / 100 | 0; // status / class

  this.statusCode = status;
  this.status = this.statusCode;
  this.statusType = type; // basics

  this.info = type === 1;
  this.ok = type === 2;
  this.redirect = type === 3;
  this.clientError = type === 4;
  this.serverError = type === 5;
  this.error = type === 4 || type === 5 ? this.toError() : false; // sugar

  this.created = status === 201;
  this.accepted = status === 202;
  this.noContent = status === 204;
  this.badRequest = status === 400;
  this.unauthorized = status === 401;
  this.notAcceptable = status === 406;
  this.forbidden = status === 403;
  this.notFound = status === 404;
  this.unprocessableEntity = status === 422;
};

},{"./utils":35}],35:[function(require,module,exports){
"use strict";

function _createForOfIteratorHelper(o, allowArrayLike) { var it; if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = o[Symbol.iterator](); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it.return != null) it.return(); } finally { if (didErr) throw err; } } }; }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

/**
 * Return the mime type for the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */
exports.type = function (str) {
  return str.split(/ *; */).shift();
};
/**
 * Return header field parameters.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */


exports.params = function (val) {
  var obj = {};

  var _iterator = _createForOfIteratorHelper(val.split(/ *; */)),
      _step;

  try {
    for (_iterator.s(); !(_step = _iterator.n()).done;) {
      var str = _step.value;
      var parts = str.split(/ *= */);
      var key = parts.shift();

      var _val = parts.shift();

      if (key && _val) obj[key] = _val;
    }
  } catch (err) {
    _iterator.e(err);
  } finally {
    _iterator.f();
  }

  return obj;
};
/**
 * Parse Link header fields.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */


exports.parseLinks = function (val) {
  var obj = {};

  var _iterator2 = _createForOfIteratorHelper(val.split(/ *, */)),
      _step2;

  try {
    for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
      var str = _step2.value;
      var parts = str.split(/ *; */);
      var url = parts[0].slice(1, -1);
      var rel = parts[1].split(/ *= */)[1].slice(1, -1);
      obj[rel] = url;
    }
  } catch (err) {
    _iterator2.e(err);
  } finally {
    _iterator2.f();
  }

  return obj;
};
/**
 * Strip content related fields from `header`.
 *
 * @param {Object} header
 * @return {Object} header
 * @api private
 */


exports.cleanHeader = function (header, changesOrigin) {
  delete header['content-type'];
  delete header['content-length'];
  delete header['transfer-encoding'];
  delete header.host; // secuirty

  if (changesOrigin) {
    delete header.authorization;
    delete header.cookie;
  }

  return header;
};

},{}],36:[function(require,module,exports){
(function (setImmediate,clearImmediate){(function (){
var nextTick = require('process/browser.js').nextTick;
var apply = Function.prototype.apply;
var slice = Array.prototype.slice;
var immediateIds = {};
var nextImmediateId = 0;

// DOM APIs, for completeness

exports.setTimeout = function() {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function() {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout =
exports.clearInterval = function(timeout) { timeout.close(); };

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function() {};
Timeout.prototype.close = function() {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function(item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function(item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function(item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout)
        item._onTimeout();
    }, msecs);
  }
};

// That's not how node.js implements it but the exposed api is the same.
exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
  var id = nextImmediateId++;
  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

  immediateIds[id] = true;

  nextTick(function onNextTick() {
    if (immediateIds[id]) {
      // fn.call() is faster so we optimize for the common use-case
      // @see http://jsperf.com/call-apply-segu
      if (args) {
        fn.apply(null, args);
      } else {
        fn.call(null);
      }
      // Prevent ids from leaking
      exports.clearImmediate(id);
    }
  });

  return id;
};

exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
  delete immediateIds[id];
};
}).call(this)}).call(this,require("timers").setImmediate,require("timers").clearImmediate)
},{"process/browser.js":23,"timers":36}],37:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],38:[function(require,module,exports){
// Currently in sync with Node.js lib/internal/util/types.js
// https://github.com/nodejs/node/commit/112cc7c27551254aa2b17098fb774867f05ed0d9

'use strict';

var isArgumentsObject = require('is-arguments');
var isGeneratorFunction = require('is-generator-function');
var whichTypedArray = require('which-typed-array');
var isTypedArray = require('is-typed-array');

function uncurryThis(f) {
  return f.call.bind(f);
}

var BigIntSupported = typeof BigInt !== 'undefined';
var SymbolSupported = typeof Symbol !== 'undefined';

var ObjectToString = uncurryThis(Object.prototype.toString);

var numberValue = uncurryThis(Number.prototype.valueOf);
var stringValue = uncurryThis(String.prototype.valueOf);
var booleanValue = uncurryThis(Boolean.prototype.valueOf);

if (BigIntSupported) {
  var bigIntValue = uncurryThis(BigInt.prototype.valueOf);
}

if (SymbolSupported) {
  var symbolValue = uncurryThis(Symbol.prototype.valueOf);
}

function checkBoxedPrimitive(value, prototypeValueOf) {
  if (typeof value !== 'object') {
    return false;
  }
  try {
    prototypeValueOf(value);
    return true;
  } catch(e) {
    return false;
  }
}

exports.isArgumentsObject = isArgumentsObject;
exports.isGeneratorFunction = isGeneratorFunction;
exports.isTypedArray = isTypedArray;

// Taken from here and modified for better browser support
// https://github.com/sindresorhus/p-is-promise/blob/cda35a513bda03f977ad5cde3a079d237e82d7ef/index.js
function isPromise(input) {
	return (
		(
			typeof Promise !== 'undefined' &&
			input instanceof Promise
		) ||
		(
			input !== null &&
			typeof input === 'object' &&
			typeof input.then === 'function' &&
			typeof input.catch === 'function'
		)
	);
}
exports.isPromise = isPromise;

function isArrayBufferView(value) {
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView) {
    return ArrayBuffer.isView(value);
  }

  return (
    isTypedArray(value) ||
    isDataView(value)
  );
}
exports.isArrayBufferView = isArrayBufferView;


function isUint8Array(value) {
  return whichTypedArray(value) === 'Uint8Array';
}
exports.isUint8Array = isUint8Array;

function isUint8ClampedArray(value) {
  return whichTypedArray(value) === 'Uint8ClampedArray';
}
exports.isUint8ClampedArray = isUint8ClampedArray;

function isUint16Array(value) {
  return whichTypedArray(value) === 'Uint16Array';
}
exports.isUint16Array = isUint16Array;

function isUint32Array(value) {
  return whichTypedArray(value) === 'Uint32Array';
}
exports.isUint32Array = isUint32Array;

function isInt8Array(value) {
  return whichTypedArray(value) === 'Int8Array';
}
exports.isInt8Array = isInt8Array;

function isInt16Array(value) {
  return whichTypedArray(value) === 'Int16Array';
}
exports.isInt16Array = isInt16Array;

function isInt32Array(value) {
  return whichTypedArray(value) === 'Int32Array';
}
exports.isInt32Array = isInt32Array;

function isFloat32Array(value) {
  return whichTypedArray(value) === 'Float32Array';
}
exports.isFloat32Array = isFloat32Array;

function isFloat64Array(value) {
  return whichTypedArray(value) === 'Float64Array';
}
exports.isFloat64Array = isFloat64Array;

function isBigInt64Array(value) {
  return whichTypedArray(value) === 'BigInt64Array';
}
exports.isBigInt64Array = isBigInt64Array;

function isBigUint64Array(value) {
  return whichTypedArray(value) === 'BigUint64Array';
}
exports.isBigUint64Array = isBigUint64Array;

function isMapToString(value) {
  return ObjectToString(value) === '[object Map]';
}
isMapToString.working = (
  typeof Map !== 'undefined' &&
  isMapToString(new Map())
);

function isMap(value) {
  if (typeof Map === 'undefined') {
    return false;
  }

  return isMapToString.working
    ? isMapToString(value)
    : value instanceof Map;
}
exports.isMap = isMap;

function isSetToString(value) {
  return ObjectToString(value) === '[object Set]';
}
isSetToString.working = (
  typeof Set !== 'undefined' &&
  isSetToString(new Set())
);
function isSet(value) {
  if (typeof Set === 'undefined') {
    return false;
  }

  return isSetToString.working
    ? isSetToString(value)
    : value instanceof Set;
}
exports.isSet = isSet;

function isWeakMapToString(value) {
  return ObjectToString(value) === '[object WeakMap]';
}
isWeakMapToString.working = (
  typeof WeakMap !== 'undefined' &&
  isWeakMapToString(new WeakMap())
);
function isWeakMap(value) {
  if (typeof WeakMap === 'undefined') {
    return false;
  }

  return isWeakMapToString.working
    ? isWeakMapToString(value)
    : value instanceof WeakMap;
}
exports.isWeakMap = isWeakMap;

function isWeakSetToString(value) {
  return ObjectToString(value) === '[object WeakSet]';
}
isWeakSetToString.working = (
  typeof WeakSet !== 'undefined' &&
  isWeakSetToString(new WeakSet())
);
function isWeakSet(value) {
  return isWeakSetToString(value);
}
exports.isWeakSet = isWeakSet;

function isArrayBufferToString(value) {
  return ObjectToString(value) === '[object ArrayBuffer]';
}
isArrayBufferToString.working = (
  typeof ArrayBuffer !== 'undefined' &&
  isArrayBufferToString(new ArrayBuffer())
);
function isArrayBuffer(value) {
  if (typeof ArrayBuffer === 'undefined') {
    return false;
  }

  return isArrayBufferToString.working
    ? isArrayBufferToString(value)
    : value instanceof ArrayBuffer;
}
exports.isArrayBuffer = isArrayBuffer;

function isDataViewToString(value) {
  return ObjectToString(value) === '[object DataView]';
}
isDataViewToString.working = (
  typeof ArrayBuffer !== 'undefined' &&
  typeof DataView !== 'undefined' &&
  isDataViewToString(new DataView(new ArrayBuffer(1), 0, 1))
);
function isDataView(value) {
  if (typeof DataView === 'undefined') {
    return false;
  }

  return isDataViewToString.working
    ? isDataViewToString(value)
    : value instanceof DataView;
}
exports.isDataView = isDataView;

function isSharedArrayBufferToString(value) {
  return ObjectToString(value) === '[object SharedArrayBuffer]';
}
isSharedArrayBufferToString.working = (
  typeof SharedArrayBuffer !== 'undefined' &&
  isSharedArrayBufferToString(new SharedArrayBuffer())
);
function isSharedArrayBuffer(value) {
  if (typeof SharedArrayBuffer === 'undefined') {
    return false;
  }

  return isSharedArrayBufferToString.working
    ? isSharedArrayBufferToString(value)
    : value instanceof SharedArrayBuffer;
}
exports.isSharedArrayBuffer = isSharedArrayBuffer;

function isAsyncFunction(value) {
  return ObjectToString(value) === '[object AsyncFunction]';
}
exports.isAsyncFunction = isAsyncFunction;

function isMapIterator(value) {
  return ObjectToString(value) === '[object Map Iterator]';
}
exports.isMapIterator = isMapIterator;

function isSetIterator(value) {
  return ObjectToString(value) === '[object Set Iterator]';
}
exports.isSetIterator = isSetIterator;

function isGeneratorObject(value) {
  return ObjectToString(value) === '[object Generator]';
}
exports.isGeneratorObject = isGeneratorObject;

function isWebAssemblyCompiledModule(value) {
  return ObjectToString(value) === '[object WebAssembly.Module]';
}
exports.isWebAssemblyCompiledModule = isWebAssemblyCompiledModule;

function isNumberObject(value) {
  return checkBoxedPrimitive(value, numberValue);
}
exports.isNumberObject = isNumberObject;

function isStringObject(value) {
  return checkBoxedPrimitive(value, stringValue);
}
exports.isStringObject = isStringObject;

function isBooleanObject(value) {
  return checkBoxedPrimitive(value, booleanValue);
}
exports.isBooleanObject = isBooleanObject;

function isBigIntObject(value) {
  return BigIntSupported && checkBoxedPrimitive(value, bigIntValue);
}
exports.isBigIntObject = isBigIntObject;

function isSymbolObject(value) {
  return SymbolSupported && checkBoxedPrimitive(value, symbolValue);
}
exports.isSymbolObject = isSymbolObject;

function isBoxedPrimitive(value) {
  return (
    isNumberObject(value) ||
    isStringObject(value) ||
    isBooleanObject(value) ||
    isBigIntObject(value) ||
    isSymbolObject(value)
  );
}
exports.isBoxedPrimitive = isBoxedPrimitive;

function isAnyArrayBuffer(value) {
  return typeof Uint8Array !== 'undefined' && (
    isArrayBuffer(value) ||
    isSharedArrayBuffer(value)
  );
}
exports.isAnyArrayBuffer = isAnyArrayBuffer;

['isProxy', 'isExternal', 'isModuleNamespaceObject'].forEach(function(method) {
  Object.defineProperty(exports, method, {
    enumerable: false,
    value: function() {
      throw new Error(method + ' is not supported in userland');
    }
  });
});

},{"is-arguments":19,"is-generator-function":20,"is-typed-array":21,"which-typed-array":40}],39:[function(require,module,exports){
(function (process){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors ||
  function getOwnPropertyDescriptors(obj) {
    var keys = Object.keys(obj);
    var descriptors = {};
    for (var i = 0; i < keys.length; i++) {
      descriptors[keys[i]] = Object.getOwnPropertyDescriptor(obj, keys[i]);
    }
    return descriptors;
  };

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  if (typeof process !== 'undefined' && process.noDeprecation === true) {
    return fn;
  }

  // Allow for deprecating things in the process of starting up.
  if (typeof process === 'undefined') {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnvRegex = /^$/;

if (process.env.NODE_DEBUG) {
  var debugEnv = process.env.NODE_DEBUG;
  debugEnv = debugEnv.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/,/g, '$|^')
    .toUpperCase();
  debugEnvRegex = new RegExp('^' + debugEnv + '$', 'i');
}
exports.debuglog = function(set) {
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (debugEnvRegex.test(set)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
exports.types = require('./support/types');

function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;
exports.types.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;
exports.types.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;
exports.types.isNativeError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var kCustomPromisifiedSymbol = typeof Symbol !== 'undefined' ? Symbol('util.promisify.custom') : undefined;

exports.promisify = function promisify(original) {
  if (typeof original !== 'function')
    throw new TypeError('The "original" argument must be of type Function');

  if (kCustomPromisifiedSymbol && original[kCustomPromisifiedSymbol]) {
    var fn = original[kCustomPromisifiedSymbol];
    if (typeof fn !== 'function') {
      throw new TypeError('The "util.promisify.custom" argument must be of type Function');
    }
    Object.defineProperty(fn, kCustomPromisifiedSymbol, {
      value: fn, enumerable: false, writable: false, configurable: true
    });
    return fn;
  }

  function fn() {
    var promiseResolve, promiseReject;
    var promise = new Promise(function (resolve, reject) {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    args.push(function (err, value) {
      if (err) {
        promiseReject(err);
      } else {
        promiseResolve(value);
      }
    });

    try {
      original.apply(this, args);
    } catch (err) {
      promiseReject(err);
    }

    return promise;
  }

  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));

  if (kCustomPromisifiedSymbol) Object.defineProperty(fn, kCustomPromisifiedSymbol, {
    value: fn, enumerable: false, writable: false, configurable: true
  });
  return Object.defineProperties(
    fn,
    getOwnPropertyDescriptors(original)
  );
}

exports.promisify.custom = kCustomPromisifiedSymbol

function callbackifyOnRejected(reason, cb) {
  // `!reason` guard inspired by bluebird (Ref: https://goo.gl/t5IS6M).
  // Because `null` is a special error value in callbacks which means "no error
  // occurred", we error-wrap so the callback consumer can distinguish between
  // "the promise rejected with null" or "the promise fulfilled with undefined".
  if (!reason) {
    var newReason = new Error('Promise was rejected with a falsy value');
    newReason.reason = reason;
    reason = newReason;
  }
  return cb(reason);
}

function callbackify(original) {
  if (typeof original !== 'function') {
    throw new TypeError('The "original" argument must be of type Function');
  }

  // We DO NOT return the promise as it gives the user a false sense that
  // the promise is actually somehow related to the callback's execution
  // and that the callback throwing will reject the promise.
  function callbackified() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }

    var maybeCb = args.pop();
    if (typeof maybeCb !== 'function') {
      throw new TypeError('The last argument must be of type Function');
    }
    var self = this;
    var cb = function() {
      return maybeCb.apply(self, arguments);
    };
    // In true node style we process the callback on `nextTick` with all the
    // implications (stack, `uncaughtException`, `async_hooks`)
    original.apply(this, args)
      .then(function(ret) { process.nextTick(cb.bind(null, null, ret)) },
            function(rej) { process.nextTick(callbackifyOnRejected.bind(null, rej, cb)) });
  }

  Object.setPrototypeOf(callbackified, Object.getPrototypeOf(original));
  Object.defineProperties(callbackified,
                          getOwnPropertyDescriptors(original));
  return callbackified;
}
exports.callbackify = callbackify;

}).call(this)}).call(this,require('_process'))
},{"./support/isBuffer":37,"./support/types":38,"_process":23,"inherits":18}],40:[function(require,module,exports){
(function (global){(function (){
'use strict';

var forEach = require('foreach');
var availableTypedArrays = require('available-typed-arrays');
var callBound = require('call-bind/callBound');

var $toString = callBound('Object.prototype.toString');
var hasSymbols = require('has-symbols')();
var hasToStringTag = hasSymbols && typeof Symbol.toStringTag === 'symbol';

var typedArrays = availableTypedArrays();

var $slice = callBound('String.prototype.slice');
var toStrTags = {};
var gOPD = require('es-abstract/helpers/getOwnPropertyDescriptor');
var getPrototypeOf = Object.getPrototypeOf; // require('getprototypeof');
if (hasToStringTag && gOPD && getPrototypeOf) {
	forEach(typedArrays, function (typedArray) {
		if (typeof global[typedArray] === 'function') {
			var arr = new global[typedArray]();
			if (!(Symbol.toStringTag in arr)) {
				throw new EvalError('this engine has support for Symbol.toStringTag, but ' + typedArray + ' does not have the property! Please report this.');
			}
			var proto = getPrototypeOf(arr);
			var descriptor = gOPD(proto, Symbol.toStringTag);
			if (!descriptor) {
				var superProto = getPrototypeOf(proto);
				descriptor = gOPD(superProto, Symbol.toStringTag);
			}
			toStrTags[typedArray] = descriptor.get;
		}
	});
}

var tryTypedArrays = function tryAllTypedArrays(value) {
	var foundName = false;
	forEach(toStrTags, function (getter, typedArray) {
		if (!foundName) {
			try {
				var name = getter.call(value);
				if (name === typedArray) {
					foundName = name;
				}
			} catch (e) {}
		}
	});
	return foundName;
};

var isTypedArray = require('is-typed-array');

module.exports = function whichTypedArray(value) {
	if (!isTypedArray(value)) { return false; }
	if (!hasToStringTag) { return $slice($toString(value), 8, -1); }
	return tryTypedArrays(value);
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"available-typed-arrays":4,"call-bind/callBound":6,"es-abstract/helpers/getOwnPropertyDescriptor":9,"foreach":11,"has-symbols":15,"is-typed-array":21}]},{},[1])(1)
});
