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

// Some notes:
// Even if you empty ./plugins and use like ./plugins-ref electron-packager uses some like regex
// and will package plugins-ref instead.  So prefix it to confuse electron-packager, 
// and also put a dummy file (like the no data handling wrapper) into plugins to get that directory
// to be packaged with an unpacked location available
// __dirname will give app.asar since plugins lives in the asar
// but we want only to scan unpacked.
// Also it seems that the plugins that are unpacked also get copied to the packed directory
// and then using __dirname looks in both places - so the require __dirname gets the unpacked 
// versions - but we have to tell __dirname to use unpacked to initialize this with manually
// after-packaging added plugin files
// so if app.asar is in the path name (packaged only) it should be replaced - and then 
// during dev the replace should do nothing
var plugDirPath = path.join(__dirname, "plugins").replace('app.asar', 'app.asar.unpacked'); 
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
            try {
                var p = require(path.join(plugDirPath, filename)); // yes this looks in app.asar.unpacked when necessary
                var Pp = p.Plugin;
                plugins.push(new Pp());
            } catch (e) {
                console.warn(`Error loading plugin ${filename} in path ${plugDirPath}: Error message: ${e}. Skipping this plugin.`);
            }
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
