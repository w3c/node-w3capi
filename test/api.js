
var expect = require("expect.js")
,   w3c = require("..")
;

if (!process.env.W3CAPIKEY) {
    console.error("No API key has been set, make sure you defined the W3CAPIKEY environment variable.");
    process.exit(1);
}
w3c.apiKey = process.env.W3CAPIKEY;

function listChecker (done, title) {
    return function (err, data) {
        expect(err).to.not.be.ok();
        expect(data).to.be.an("array");
        if (title) expect(data.some(function (it) { return it.title === title; })).to.be.ok();
        done();
    };
}

function embedChecker (done, field, value) {
    return function (err, data) {
        expect(err).to.not.be.ok();
        expect(data).to.be.an("array");
        expect(data.some(function (it) { return it[field] === value; })).to.be.ok();
        done();
    };
}

function itemChecker (done, field, value) {
    return function (err, data) {
        expect(err).to.not.be.ok();
        expect(data[field]).to.equal(value);
        done();
    };
}

describe("Domains", function () {
    it("can be listed", function (done) {
        w3c.domains().fetch(listChecker(done, "Interaction"));
    });
    it("can be fetched", function (done) {
        w3c.domain(41481).fetch(itemChecker(done, "name", "Interaction"));
    });
    it("have groups", function (done) {
        w3c.domain(41481).groups().fetch(listChecker(done, "Internationalization Working Group"));
    });
    it("have users", function (done) {
        w3c.domain(41481).users().fetch(listChecker(done, "Philippe Le Hégaret"));
    });
});


describe("Groups", function () {
    it("can be listed", function (done) {
        w3c.groups().fetch(listChecker(done, "Cascading Style Sheets (CSS) Working Group"));
    });
    it("can be fetched", function (done) {
        w3c.group(32061).fetch(itemChecker(done, "name", "Cascading Style Sheets (CSS) Working Group"));
    });
    it("have chairs", function (done) {
        // XXX this will change soon
        w3c.group(32061).chairs().fetch(listChecker(done, "Daniel Glazman"));
    });
    it("have services", function (done) {
        w3c.group(32061).services().fetch(listChecker(done, "Wiki"));
    });
    it("have specifications", function (done) {
        w3c.group(32061).specifications().fetch(listChecker(done, "Selectors Level 3"));
    });
    it("have teamcontacts", function (done) {
        w3c.group(32061).teamcontacts().fetch(listChecker(done, "Bert Bos"));
    });
    it("have users", function (done) {
        w3c.group(32061).users().fetch(listChecker(done, "Tab Atkins Jr."));
    });
    it("have charters", function (done) {
        w3c.group(32061).charters().fetch(listChecker(done));
    });
    it("have charters that can be fetched", function (done) {
        w3c.group(32061).charter(102).fetch(itemChecker(done, "end", "1999-02-28"));
    });
});


describe("Services", function () {
    it("can be fetched", function (done) {
        w3c.service(2).fetch(itemChecker(done, "type", "tracker"));
    });
    it("have groups", function (done) {
        w3c.service(2).groups().fetch(listChecker(done, "Systems"));
    });
});


describe("Specifications", function () {
    it("can be listed", function (done) {
        w3c.specifications().fetch(listChecker(done, "SVG Paths"));
    });
    it("can be fetched", function (done) {
        w3c.specification("rex").fetch(itemChecker(done, "shortname", "rex"));
    });
    it("have superseded", function (done) {
        w3c.specification("SVG").superseded().fetch(listChecker(done, "Scalable Vector Graphics (SVG) 1.1 (Second Edition)"));
    });
    it("have supersedes", function (done) {
        w3c.specification("SVG11").supersedes().fetch(listChecker(done, "Scalable Vector Graphics (SVG) 1.0 Specification"));
    });
    it("have latest", function (done) {
        w3c.specification("SVG11").latest().fetch(itemChecker(done, "date", "2011-08-16"));
    });
});



describe("Specifications Version", function () {
    it("can be listed", function (done) {
        w3c.specification("SVG11").versions().fetch(listChecker(done, "Scalable Vector Graphics (SVG) 1.1 Specification"));
    });
    it("can be fetched", function (done) {
        w3c.specification("SVG11").version("20030114").fetch(itemChecker(done, "date", "2003-01-14"));
    });
    it("have deliverers", function (done) {
        w3c.specification("SVG11").version("20030114").deliverers().fetch(listChecker(done, "SVG Working Group"));
    });
    it("have editors", function (done) {
        w3c.specification("SVG11").version("20030114").editors().fetch(listChecker(done, "Dean Jackson"));
    });
    it("have next", function (done) {
        w3c.specification("CSS2").version("20070719").successors().fetch(listChecker(done, "Candidate Recommendation"));
    });
    it("have previous", function (done) {
        w3c.specification("CSS2").version("20090423").predecessors().fetch(listChecker(done, "Candidate Recommendation"));
    });
});


describe("Users", function () {
    var dino = "ivpki36ou94oo08osswccs80gcwogwk";
    it("can be fetched", function (done) {
        w3c.user(dino).fetch(itemChecker(done, "given", "Dean"));
    });
    it("have affiliations", function (done) {
        w3c.user(dino).affiliations().fetch(listChecker(done));
    });
    it("have groups", function (done) {
        w3c.user(dino).groups().fetch(listChecker(done, "Alumni"));
    });
    it("have specifications", function (done) {
        w3c.user(dino).specifications().fetch(listChecker(done, "Scalable Vector Graphics (SVG) Full 1.2 Specification"));
    });
});


describe("Embeds", function () {
    it("apply to domains", function (done) {
        w3c.domains().fetch({ embed: true }, embedChecker(done, "name", "Management"));
    });
    it("apply to groups", function (done) {
        w3c.groups().fetch({ embed: true }, embedChecker(done, "type", "community group"));
    });
    it("apply to specifications", function (done) {
        w3c.specifications().fetch({ embed: true }, embedChecker(done, "shortname", "wbxml"));
    });
});

