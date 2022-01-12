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
Ctx.prototype.fetch = async function (options, cb) {
    if (typeof options === "function") {
        cb = options;
        options = {};
    }
    let promise;
    if (typeof cb !== "function") {
        let resolve, reject;
        promise = new Promise((res, rej) => { resolve = res; reject = rej;});
        cb = (err, result) => { if (err) return reject(err); return resolve(result) ; } ;
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
    if (!!promise) {
        return promise;
    }

};

// generates a function for the root list
function rootList (type, linkKey) {
    return function (name) {
        var ctx = new Ctx();
        ctx.type = "list";
        ctx.linkKey = linkKey ? linkKey : type;
        ctx.steps = [type];
        if (!!name) ctx.steps.push(name);
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
        if (typeof shortnameOrId === 'number' || typeof shortnameOrId === 'string') {
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

//------------------------------------- 12. Specifications by status

exports.specificationsByStatus  = rootList('specifications-by-status', 'specifications');


