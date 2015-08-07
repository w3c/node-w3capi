
var sua = require("superagent")
,   util = require("util")
,   async = require("async")
;

// this is the base URL we use, which can be overridden
exports.baseURL = "https://api-test.w3.org/";

// slurping helper
function makeRequest (url, embed, page) {
    var query = {};
    if (embed) query.embed = "true";
    if (page) query.page = page;
    return sua.get(url)
                .accept("json")
                .query(query)
    ;
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
        if (body.pages == 1) return cb(null, body._links[key]);
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
                    cb(null, res.body._links[key]);
                });
            }
        ,   function (err, allRes) {
                if (err) return cb(err);
                var allData = body._links[key];
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
    items.forEach(function (it) {
        obj.prototype[it] = function () {
            this.steps.push(it);
            this.type = "list";
            this    .linkKey = it;
            return this;
        };
    });
}

// generates a step that takes an ID
function idStep (obj, name) {
    return function (id) {
        var ctx = obj ? new obj() : this;
        ctx.steps.push(name);
        ctx.steps.push(id);
        return ctx;
    };
}



// w3c.domains().fetch()
exports.domains = rootList("domains");

// Domain-specific Ctx
function DomainCtx (ctx) {
    Ctx.call(this, ctx);
}
subSteps(DomainCtx, ["activities", "groups", "services", "users"]);

// w3c.domain(41481).fetch()
// w3c.domain(41481).groups().fetch()
// w3c.domain(41481).activities().fetch()
// w3c.domain(41481).services().fetch()
// w3c.domain(41481).users().fetch()
exports.domain = idStep(DomainCtx, "domains");



// w3c.groups().fetch()
exports.groups = rootList("groups");

// Group-specific Ctx
function GroupCtx (ctx) {
    Ctx.call(this, ctx);
}
subSteps(GroupCtx, ["chairs", "services", "specifications", "teamcontacts", "users", "charters"]);
GroupCtx.prototype.charter = idStep(null, "charters");

// w3c.group(54381).fetch()
// w3c.group(54381).chairs().fetch()
// w3c.group(54381).services().fetch()
// w3c.group(54381).specifications().fetch()
// w3c.group(54381).teamcontacts().fetch()
// w3c.group(54381).users().fetch()
// w3c.group(54381).charters().fetch()
// w3c.group(46884).charter(89).fetch()
exports.group = idStep(GroupCtx, "groups");



// Service-specific Ctx
function ServiceCtx (ctx) {
    Ctx.call(this, ctx);
}
subSteps(ServiceCtx, ["groups"]);

// w3c.services(2).fetch()
// w3c.services(2).groups().fetch()
exports.service = idStep(ServiceCtx, "services");



