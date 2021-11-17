// plugins.js
// 

const EventEmitter = require('events').EventEmitter;

var pluginEmitter = new EventEmitter();

var pluginPushDataSet = function(data) {
    pluginEmitter.emit('dataSetReady', data); // this works when not class instanced...
}

// plugins.pushInit({
//     type: "rawWaveformProcessing",
//     numChannels: dataIsNumChans,
//     returnDataElementBaseName: 'chartThickness'
//   });
var pluginPushInit = function(data) {
    console.log(`pushInit: ${data.msgType} ${data}`);
    pluginEmitter.emit(data.msgType, data);
}


// Testing Plugins Approaches
// However, now moving to an event based approach for testing,
// so we don't necessarily want to require each plugin - or maybe we do 
// hmmm - caution with circular dependency if the plugin wrapper templates 
// also require plugins.js (this file)
var plugDirPath = path.join(__dirname, "plugins");
if ( fs.existsSync(plugDirPath)) {
    var pluginFns = fs.readdirSync(plugDirPath);
    console.log("plugins: ", pluginFns);
    var plugins = [];
    pluginFns.forEach( filename => {
        console.log("path: ", path.join(plugDirPath, filename));
        // Add logic here for excluding by filename - or even move response to hello
        // functions below here so the item is not pushed as a require if not needed
        if ( filename.endsWith(".js") && (filename.toLowerCase().indexOf("child") === -1) ){
            //plugins.push(require("./plugins/" + filename));
            var p = require("./plugins/" + filename);
            var Pp = p.Plugin;
            plugins.push(new Pp());
        }
    });
    console.log(plugins);
    plugins.forEach( p => {
        try {
            //console.log(p.sayHello("Rocky"));
            console.log("Plugin Ident: ", p.Ident());
            p.SetEv(pluginEmitter);
            p.enabled = true;
        } catch (e) {
            console.log(`${JSON.stringify(p)} does not support method. ${e}`);
            p.enabled = false;
        }
    });
    console.log(plugins);
} else {
    console.log("./plugins exists? ", false);
}



module.exports = {
    pluginPushDataSet,
    pluginPushInit,
    pluginEmitter
}
