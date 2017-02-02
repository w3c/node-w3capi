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

describe('Functions', function () {
    it('can be listed', function (done) {
        w3c.functions().fetch(listChecker(done, 'Systems'));
    });
    it('can be fetched', function (done) {
        w3c.function(109).fetch(itemChecker(done, 'name', 'Systems'));
    });
    it('have services', function (done) {
        w3c.function(109).services().fetch(listChecker(done, 'Issues Tracking'));
    });
    it('have users', function (done) {
        w3c.function(109).users().fetch(listChecker(done, 'Laurent Carcone'));
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
        w3c.group(32061).chairs().fetch(listChecker(done, "Rossen Atanassov"));
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
    it("have participations", function (done) {
        w3c.group(32061).participations().fetch(listChecker(done));
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
    it("have successors", function (done) {
        w3c.specification("CSS2").version("20070719").successors().fetch(listChecker(done, "Candidate Recommendation"));
    });
    it("have predecessors", function (done) {
        w3c.specification("CSS2").version("20090423").predecessors().fetch(listChecker(done, "Candidate Recommendation"));
    });
});


describe("Users", function () {
    var ian = "ggdj8tciu9kwwc4o4ww888ggkwok0c8";
    it("can be fetched", function (done) {
        w3c.user(ian).fetch(itemChecker(done, "given", "Ian"));
    });
    it("have affiliations", function (done) {
        w3c.user(ian).affiliations().fetch(listChecker(done));
    });
    it("have groups", function (done) {
        w3c.user(ian).groups().fetch(listChecker(done, "Community Council"));
    });
    it("have participations", function (done) {
        w3c.user(ian).participations().fetch(listChecker(done, "Web Payments Working Group"));
    });
    it("have specifications", function (done) {
        w3c.user(ian).specifications().fetch(listChecker(done, "Accessibility Features of CSS"));
    });
});

describe('Affiliations', function () {
    const STAFF = 52794;
    it('can be listed', function (done) {
        w3c.affiliations().fetch(listChecker(done, 'Framkom (Forskningsaktiebolaget Medie-och Kommunikationsteknik)'));
    });
    it('can be fetched', function (done) {
        w3c.affiliation(STAFF).fetch(itemChecker(done, 'name', 'W3C Staff'));
    });
    it('have participants', function (done) {
        w3c.affiliation(STAFF).participants().fetch(listChecker(done, 'Kazuyuki Ashimura'));
    });
    it('have participations', function (done) {
        w3c.affiliation(STAFF).participations().fetch(listChecker(done, 'Evaluation and Repair Tools Working Group'));
    });
});

describe('Participations', function () {
     const WIKI = 1503;
    it('can be fetched', function (done) {
        w3c.participation(WIKI).fetch(itemChecker(done, 'created', '2011-03-07 08:59:38'));
    });
    it('have participants', function (done) {
        w3c.participation(WIKI).participants().fetch(listChecker(done, 'Oliver Friedrich'));
    });
});

describe("Embeds", function () {
    it('apply to functions', function (done) {
        w3c.functions().fetch({ embed: true }, embedChecker(done, 'name', 'Management'));
    });
    it("apply to groups", function (done) {
        w3c.groups().fetch({ embed: true }, embedChecker(done, "type", "community group"));
    });
    it("apply to specifications", function (done) {
        w3c.specifications().fetch({ embed: true }, embedChecker(done, "shortname", "wbxml"));
    });
});
