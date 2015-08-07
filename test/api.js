
var expect = require("expect.js")
,   w3c = require("..")
;

describe("Domains", function () {
    it("can be listed", function (done) {
        w3c.domains().fetch(function (err, data) {
            expect(err).to.not.be.ok();
            expect(data).to.be.an("array");
            expect(data.filter(function (it) { return it.title === "Interaction"; })).to.be.ok();
            done();
        });
    });
    it("can be fetched", function (done) {
        w3c.domain(41481).fetch(function (err, data) {
            expect(err).to.not.be.ok();
            expect(data.name).to.equal("Interaction");
            done();
        });
    });
    it("have groups", function (done) {
        w3c.domain(41481).groups().fetch(function (err, data) {
            expect(err).to.not.be.ok();
            expect(data).to.be.an("array");
            expect(data.filter(function (it) { return it.title === "Internationalization Working Group"; })).to.be.ok();
            done();
        });
    });
    it("have activities", function (done) {
        w3c.domain(41481).activities().fetch(function (err, data) {
            expect(err).to.not.be.ok();
            expect(data).to.be.an("array");
            expect(data.filter(function (it) { return it.title === "Style"; })).to.be.ok();
            done();
        });
    });
    it("have users", function (done) {
        w3c.domain(41481).users().fetch(function (err, data) {
            expect(err).to.not.be.ok();
            expect(data).to.be.an("array");
            expect(data.filter(function (it) { return it.title === "Philippe Le Hégaret"; })).to.be.ok();
            done();
        });
    });
});


// w3c.groups().fetch()

// w3c.group(54381).fetch()
// w3c.group(54381).chairs().fetch()
// w3c.group(54381).services().fetch()
// w3c.group(54381).specifications().fetch()
// w3c.group(54381).teamcontacts().fetch()
// w3c.group(54381).users().fetch()
// w3c.group(54381).charters().fetch()
// w3c.group(46884).charter(89).fetch()


// w3c.services(2).fetch()
// w3c.services(2).groups().fetch()


// w3c.specifications().fetch()

// w3c.specification("SVG").fetch()
// w3c.specification("SVG").superseded().fetch()
// w3c.specification("SVG").supersedes.fetch()
// w3c.specification("SVG").versions().fetch()
// w3c.specification("SVG").version("19991203").fetch()
// w3c.specification("SVG").version("19991203").deliverers().fetch()
// w3c.specification("SVG").version("19991203").editors().fetch()
// w3c.specification("SVG").version("19991203").next().fetch()
// w3c.specification("SVG").version("19991203").previous().fetch()


// w3c.user("ivpki36ou94oo08osswccs80gcwogwk").fetch()
// w3c.user("ivpki36ou94oo08osswccs80gcwogwk").affiliations().fetch()
// w3c.user("ivpki36ou94oo08osswccs80gcwogwk").groups().fetch()
// w3c.user("ivpki36ou94oo08osswccs80gcwogwk").specifications().fetch()

