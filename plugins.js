// plugins.js
// 

const EventEmitter = require('events').EventEmitter;

var pluginDataReady = new EventEmitter();

var pluginPushDataSet = function(data) {
    pluginDataReady.emit('dataSetReady', data);
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
    if ( filename.endsWith(".js") ){
        plugins.push(require("./plugins/" + filename));
    }
    })
    console.log(plugins);
    plugins.forEach( p => {
        console.log(p.sayHello("Rocky"));
        console.log("Plugin Ident: ", p.ident());
        p.setEv(pluginDataReady);
    })
} else {
    console.log("./plugins exists? ", false);
}


// Testing
// var i = 0x00;
// setInterval( () => {
//     pluginDataReady.emit('dataSetReady', Buffer.alloc(12, i++, Uint8Array));
// }, 4000);


module.exports = {
    pluginPushDataSet,
    pluginDataReady
}
