var expect = require("expect.js")
,   w3c = require("..")
;

if (!process.env.W3CAPIKEY) {
    console.error("No API key has been set, make sure you defined the W3CAPIKEY environment variable.");
    process.exit(1);
}
w3c.apiKey = process.env.W3CAPIKEY;

function listChecker (done, title, field = 'title') {
    return function (err, data) {
        expect(err).to.not.be.ok();
        expect(data).to.be.an("array");
        if (title) expect(data.some(function (it) { return it[field] === title; })).to.be.ok();
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
        w3c.function(122803).fetch(itemChecker(done, 'name', 'Systems'));
    });
    it('have services', function (done) {
        w3c.function(122803).services().fetch(listChecker(done, 'Issue Tracking'));
    });
    it('have users', function (done) {
        w3c.function(122803).users().fetch(listChecker(done, 'Laurent Carcone'));
    });
});


describe("Groups", function () {
    it("can be listed", function (done) {
        w3c.groups().fetch(listChecker(done, "Cascading Style Sheets (CSS) Working Group"));
    });
    it("can be fetched", function (done) {
        w3c.group(32061).fetch(itemChecker(done, "name", "Cascading Style Sheets (CSS) Working Group"));
    });
    it("can be fetched with string", function (done) {
        w3c.group("32061").fetch(itemChecker(done, "name", "Cascading Style Sheets (CSS) Working Group"));
    });
    it("can be fetched with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).fetch(itemChecker(done, "name", "Cascading Style Sheets (CSS) Working Group"));
    });
    it("have chairs", function (done) {
        w3c.group(32061).chairs().fetch(listChecker(done, "Rossen Atanassov"));
    });
    it("have chairs with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).chairs().fetch(listChecker(done, "Rossen Atanassov"));
    });
    it("have services", function (done) {
        w3c.group(32061).services().fetch(listChecker(done, "Wiki"));
    });
    it("have services with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).services().fetch(listChecker(done, "Wiki"));
    });
    it("have specifications", function (done) {
        w3c.group(32061).specifications().fetch(listChecker(done, "Selectors Level 3"));
    });
    it("have specifications with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).specifications().fetch(listChecker(done, "Selectors Level 3"));
    });
    it("have teamcontacts", function (done) {
        w3c.group(32061).teamcontacts().fetch(listChecker(done, "Chris Lilley"));
    });
    it("have teamcontacts with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).teamcontacts().fetch(listChecker(done, "Chris Lilley"));
    });
    it("have users", function (done) {
        w3c.group(32061).users().fetch(listChecker(done, "Tab Atkins Jr."));
    });
    it("have users with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).users().fetch(listChecker(done, "Tab Atkins Jr."));
    });
    it("have charters", function (done) {
        w3c.group(32061).charters().fetch(listChecker(done));
    });
    it("have charters with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).charters().fetch(listChecker(done));
    });
    it("have charters that can be fetched", function (done) {
        w3c.group(32061).charter(102).fetch(itemChecker(done, "end", "1999-02-28"));
    });
    it("have charters that can be fetched with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).charter(102).fetch(itemChecker(done, "end", "1999-02-28"));
    });
    it("have participations", function (done) {
        w3c.group(32061).participations().fetch(listChecker(done));
    });
    it("have participations with type/shortname", function (done) {
        w3c.group({type: "wg", shortname: "css"}).participations().fetch(listChecker(done));
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
        w3c.specification("CSS21").version("20070719").successors().fetch(listChecker(done, "Candidate Recommendation Snapshot"));
    });
    it("have predecessors", function (done) {
        w3c.specification("CSS21").version("20090423").predecessors().fetch(listChecker(done, "Candidate Recommendation Snapshot"));
    });
});


describe("Users", function () {
    var ian = "ggdj8tciu9kwwc4o4ww888ggkwok0c8";
    it("can be fetched", function (done) {
        w3c.user(ian).fetch(itemChecker(done, "given", "Ian"));
    });
    it("can be retrieved by github account id", function (done) {
        // this is jean-gui
        w3c.user({type: 'github', id: '1479073'}).fetch(itemChecker(done, "given", "Jean-Guilhem"));
    });
    it("have affiliations", function (done) {
        w3c.user(ian).affiliations().fetch(listChecker(done));
    });
    it("have groups", function (done) {
        w3c.user(ian).groups().fetch(listChecker(done, "Community Groups Development Lead"));
    });
    it("have participations", function (done) {
        w3c.user(ian).participations().fetch(listChecker(done, "Web Payments Working Group"));
    });
    it("have specifications", function (done) {
        w3c.user(ian).specifications().fetch(listChecker(done, "Accessibility Features of CSS"));
    });
    it("is team contact of", function (done) {
        w3c.user(ian).teamcontactofgroups().fetch(listChecker(done, "Web Payments Working Group"));
    });
});

describe('Affiliations', function () {
    const STAFF = 52794;
    it('can be listed', function (done) {
        w3c.affiliations().fetch(listChecker(done, 'Framkom (Forskningsaktiebolaget Medie-och Kommunikationsteknik)'));
    });
    it('can be fetched', function (done) {
        w3c.affiliation(STAFF).fetch(itemChecker(done, 'name', 'W3C'));
    });
    it('have participants', function (done) {
        w3c.affiliation(STAFF).participants().fetch(listChecker(done, 'Kazuyuki Ashimura'));
    });
    it('have participations', function (done) {
        w3c.affiliation(STAFF).participations().fetch(listChecker(done, 'Accessibility Guidelines Working Group'));
    });
});

describe('Participations', function () {
    const PARTICIPATION = 656;
    it('can be fetched', function (done) {
        w3c.participation(PARTICIPATION).fetch(itemChecker(done, 'created', '2011-10-24 08:50:51'));
    });
});

describe('Translations', function () {
     const XHTMLBASIC_CA = 24;
    it("can be listed", function (done) {
        w3c.translations().fetch(listChecker(done, "XHTML™ Basic"));
    });
    it('can be fetched', function (done) {
        w3c.translation(XHTMLBASIC_CA).fetch(itemChecker(done, 'language', 'ca'));
    });
});

describe('Call for translations', function () {
     const XHTMLBASIC = 13;
    it("can be listed", function (done) {
        w3c.callsfortranslation().fetch(listChecker(done, "XHTML™ Basic"));
    });
    it('can be fetched', function (done) {
        w3c.callfortranslation(XHTMLBASIC).fetch(itemChecker(done, 'title', 'XHTML™ Basic'));
    });
});


describe('Non-participant licensing commitments', function () {
   it("can be fetched", function (done) {
       w3c.nplcs().fetch(listChecker(done, 9252268, 'repoId'));
   });
   it('can be fetched', function (done) {
       w3c.nplc({repoId: 9252268, pr: 4575}).fetch(itemChecker(done, 'repository-id', 9252268));
   });
});


describe('Specifications by status', function () {
    it("can be listed", function (done) {
        w3c.specificationsByStatus("Recommendation").fetch(listChecker(done, "Webmention"));
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

describe("Specification Series", function() {
    const CSSCOLOR = 'css-color';
    it('can be fetched', function (done) {
        w3c.specificationseries(CSSCOLOR).fetch(itemChecker(done, 'shortname', CSSCOLOR));
    });
    it("have specifications", function (done) {
        w3c.specificationseries(CSSCOLOR).specifications().fetch(listChecker(done, "CSS Color Module Level 3"));
    });
});

describe("Promises API", function() {
    it('returns a promise if no callback is set', async function() {
        const groups = await w3c.groups().fetch();
        expect(groups).to.be.an("array");
        expect(groups.some(function (it) { return it.title === "Cascading Style Sheets (CSS) Working Group"; })).to.be.ok();
    });
});
