//
// dummyWrapper.js
//
//
// Plugin wrappers should include the minimum as in this file
//

var ev; // why am i blanking on a better way to do this?

var sayHello = function(toWhoseLittleFriend) {
    return `Al Pacino: Say Hello to My Little Friend, ${toWhoseLittleFriend}`;
}

var setEv = function(em) {
    ev = em;
    ev.on("dataSetReady", function(data) {
      console.log(__filename, " dummyWrapper received dataSetReady event");
      console.log(data);
    });
}

var ident = function() {
    return "DummyWrapper";
}

module.exports = {
    sayHello : sayHello,
    ident : ident,
    setEv : setEv
};