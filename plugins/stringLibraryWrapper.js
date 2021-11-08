//
// stringLibraryWrapper.js
//
//
// Plugin wrappers should include the minimum as in this file
//

var edge = require('electron-edge-js');

// 
// <EDIT TO MATCH YOUR PLUGIN>
const libName = "StringLibrary";
// </EDIT TO MATCH YOUR PLUGIN>
//

const libFileName = `${libName}.dll`;
const libPath = path.join(__dirname, libFileName);

var stringLibraryWrapper = edge.func({
    assemblyFile: libPath,
    typeName: `${libName}.Startup`//,
    // methodName: 'StartsWithUpper' // Defaults to Invoke - which is the first test
});
var s = "test";
stringLibraryWrapper( test, function ( error, result) {
    console.log("test StartsWithUpper: ", result); // should false
});
var countLibWrap = edge.func({
    assemblyFile: libPath,
    typeName: `${libName}.Test`,
    methodName: 'CountLength'
});
countLibWrap( Buffer.alloc(12, 0xC5, Uint8Array), function (error, result) {
    console.log("test buffer length: ", result); // Should 12
});




var ev; // why am i blanking on a better way to do this?

var sayHello = function(toWhoseLittleFriend) {
    return `Al Pacino: Say Hello to My Little Friend, ${toWhoseLittleFriend}`;
}

var setEv = function(em) {
    ev = em;
    ev.on("dataSetReady", function(data) {
      console.log(__filename, " stringLibraryWrapper received dataSetReady event");
      console.log(data);
    });
}

var ident = function() {
    return "stringLibraryWrapper";
}

var test = function() {

}

module.exports = {
    sayHello : sayHello,
    ident : ident,
    setEv : setEv,
    test : test 
};