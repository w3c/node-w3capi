
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
        if (body.pages == 1) return cb(null, arrayify(body._links[key]));
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
                    cb(null, arrayify(res.body._links[key]));
                });
            }
        ,   function (err, allRes) {
                if (err) return cb(err);
                var allData = arrayify(body._links[key]);
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
function idStep (obj, name, inherit) {
    return function (id) {
        var ctx = obj ? new obj(inherit ? this : undefined) : this;
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




// w3c.specifications().fetch()
exports.specifications = rootList("specifications");

// Specification-specific Ctx
function SpecificationCtx (ctx) {
    Ctx.call(this, ctx);
}
// XXX superseded/supersedes are currently broken in the API
// I also suspect an annoying data model, as for next/previous below
/*"superseded", "supersedes", */
subSteps(SpecificationCtx, ["versions"]);

// Version-specific Ctx
function VersionCtx (ctx) {
    Ctx.call(this, ctx);
}
// XXX
// next/previous suck because they're an item link but have an array field ("versions") that doesn't match the
// the name ("previous"/"next"), so it's completely irregular compared to the rest
// because of that they're not exposed
/*, "next", "previous"*/
subSteps(VersionCtx, ["deliverers", "editors"]);
SpecificationCtx.prototype.version = idStep(VersionCtx, "versions", true);

// w3c.specification("SVG").fetch()
// w3c.specification("SVG").superseded().fetch()
// w3c.specification("SVG").supersedes.fetch()
// w3c.specification("SVG").versions().fetch()
// w3c.specification("SVG").version("19991203").fetch()
// w3c.specification("SVG").version("19991203").deliverers().fetch()
// w3c.specification("SVG").version("19991203").editors().fetch()
// w3c.specification("SVG").version("19991203").next().fetch()
// w3c.specification("SVG").version("19991203").previous().fetch()
exports.specification = idStep(SpecificationCtx, "specifications");



// User-specific Ctx
function UserCtx (ctx) {
    Ctx.call(this, ctx);
}
subSteps(UserCtx, ["affiliations", "groups", "specifications"]);

// w3c.user("ivpki36ou94oo08osswccs80gcwogwk").fetch()
// w3c.user("ivpki36ou94oo08osswccs80gcwogwk").affiliations().fetch()
// w3c.user("ivpki36ou94oo08osswccs80gcwogwk").groups().fetch()
// w3c.user("ivpki36ou94oo08osswccs80gcwogwk").specifications().fetch()
exports.user = idStep(UserCtx, "users");
