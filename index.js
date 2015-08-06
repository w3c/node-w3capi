
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
        if (body.pages == 1) return cb(null, body._links);
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
                    cb(null, res.body._links);
                });
            }
        ,   function (err, allRes) {
                if (err) return cb(err);
                var allData = body._links;
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
        ctx.steps = [type];
        return ctx;
    };
}

// generates steps beneath an existing one that has an ID
function subSteps (obj, items) {
    items.forEach(function (it) {
        obj.prototype[it] = function () {
            this.steps.push(it);
            this.type = "list";
            return this;
        };
    });
}

// w3c.domains().fetch()
exports.domains = rootList("domains");

// Domain-specific Ctx
function DomainCtx (ctx) {
    if (ctx) this.id = ctx.id;
    Ctx.call(this, ctx);
}
util.inherits(DomainCtx, Ctx);
subSteps(DomainCtx, ["activities", "groups", "services", "users"]);

// w3c.domain("interaction").fetch()
exports.domain = function (id) {
    var ctx = new DomainCtx();
    ctx.id = id;
    ctx.steps = ["domains", id];
    return ctx;
};



