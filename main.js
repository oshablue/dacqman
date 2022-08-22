const electron = require('electron');
const url = require('url');
const path = require('path');
const fs = require('fs');


const SettingsStorage = require('./settingsStorage.js');
const { ipcRenderer } = require('electron');


const {app, BrowserWindow, Menu, ipcMain} = electron;


// SET ENV
process.env.NODE_ENV = 'development';//'production'; // lose the devtools etc.


let mainWindow;
let addWindow;





//
// SETTINGS / PREFERENCES
//
// When adding settings, add them here, then to have the new settings integrated 
// into the settings storage, simply close DacqMan if running and re-open.
// Reload won't do it.  This should retain existing settings values and add the 
// new settings keys and their default values as they are here.
const settingsFileName = "dacqman-settings";
const settingsDefaults = {
  windowBounds: { width: 800, height: 900 },
  customCommandsFilePath: './user-data/control-port-buttons.json', // TODO - move to constants?
  customCommandsFilePathPackaged: './user-data/control-port-buttons.json',
  customCaptureOptionsFilePath: './user-data/capture-options.json',
  customCaptureOptionsFilePathPackaged: './user-data/capture-options.json',
  customTransducerCalibrationFilesDirectory: './user-data/transducer-calibration-files/',
  customTransducerCalibrationFilesDirectoryPackaged: './user-data/transducer-calibration-files/',
  interfaceDefault: 'regular',
  interface: 'dataCaptureFocused',          // regular, dataCaptureFocused
  delayControlPortOpenMs: 1000,             // delay + forWhat + units {Ms, Sec, etc.} // TODO implement setter
  // OB NKS: circa imaginary v0.0.14
  boolUsePlugins: true                      // true, false
  // OB NKS: begin: dacqman v0.0.15 
  , interfaceRefinement: 'simple' // ['', none, simple]
  , customControlSettingsJson: {}               // json sub by divId and then control id
  , devToolsOpen: false                     // restore on opening // TODO FUTURE currently Xing out of devTools doesn't update this
  //, cssToUse: ''                            // default css/custom.css // just use any other or default to custom.css
};
// TODO on load check that at least each key exists - in the case of migrating to
// new settings version

// Again for prefs, settings, config tutorial, thanks to (and please see):
// https://cameronnokes.com/blog/how-to-store-user-data-in-electron/
var settingsStorage = new SettingsStorage({
  settingsFileName: settingsFileName,       // .json etc is added by the module
  defaults: settingsDefaults
});





// Listenfor the app to be ready
app.on('ready', function(){

  let { width, height } = settingsStorage.get('windowBounds');

  // Create new mainWindow
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    webPreferences: {
      nodeIntegration: true // Set to false if issues with jQuery, Angular - see Electron FAQ
    }
  });
  // Load html into window
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'mainWindow.html'),
    protocol: 'file:',
    slashes: true
  }));

  if ( settingsStorage.get('devToolsOpen') ) {
    mainWindow.webContents.openDevTools();
  }

  // At one point we used the mainWindow resize event to store window bounds,
  // but that was too busy - needed to implement either settimeout etc. to handle
  // continuous drag resize events, or rather, now we just implement it before
  // window closes - see below and in the mainWindow script

  // Quit app when closed
  mainWindow.on('closed', function(){
    app.quit();
  });

  // Build menu from template
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  // Insert menu
  Menu.setApplicationMenu(mainMenu);
}); // end of app.on ready

// Handle File Thing 1 create add Window
function createAddWindow(){
  addWindow = new BrowserWindow({
    width: 300,
    height: 200,
    title: 'File Thing 1 Add Window',
    webPreferences: {
      nodeIntegration: true
    }
  });
  // Load html into window
  addWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'addWindow.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Garbage collection handle
  addWindow.on('close', function(){
    addWindow = null;
  });
}

// Catch item:add
ipcMain.on('item:add', function(e, item){
  console.log(item);
  mainWindow.webContents.send('item:add', item);
  addWindow.close();
});

// For serial port data received:
ipcMain.on('port:ondata', function(e, data){
  console.log("ipcMain received port:ondata");
  logToMain("ipcMain received port:ondata")
  mainWindow.webContents.send('port:ondata', data);
});

// For logging to main window dev tools window
ipcMain.on('logToMain', function(e, data) {
  mainWindow.webContents.send('log', data);
});
var logToMain = function(data) {
  mainWindow.webContents.send('log', data);
}









//
//
// Settings, Config and Preferences Stuff
//
//
//
ipcMain.on('prefs:show', function(e, data){
  // in main.js (ipcMain) the console.log goes to the command line, if launched from terminal by eg npm start
  console.log("ipcMain received prefs:show ... here is user data path: " + app.getPath('userData'));
  logToMain("ipcMain received prefs:show ... here is user data path: " + app.getPath('userData'));
  mainWindow.webContents.send('prefs:show', "ipcMain received prefs:show: " + app.getPath('userData'));
});
ipcMain.on('prefs:storeWindowBounds', function(e) {
  let { width, height } = mainWindow.getBounds();
  settingsStorage.set('windowBounds', { width, height });
  console.log("Stored settings for updated window bounds for mainWindow width and height.");
  logToMain("Stored settings for updated window bounds for mainWindow width and height.")
});
ipcMain.on('prefs:getPrefs', (e) => {
  e.returnValue = settingsStorage.getAll();
});
ipcMain.on('prefs:reset', (e) => {
  fs.unlinkSync(settingsStorage.getFilePath());   // delete the file
  settingsStorage = null;
  settingsStorage = new SettingsStorage({
    settingsFileName: settingsFileName,       // .json etc is added by the module
    defaults: settingsDefaults
  });
  settingsStorage.forceSave();                // save now without waiting for a set(key)
  logToMain("Reset to defaults and saved the prefs/settings.");
});
ipcMain.on('prefs:set', (e, args) => {
  console.log("Stored to prefs: " + JSON.stringify(args));
  logToMain("Stored to prefs: " + JSON.stringify(args))
  settingsStorage.set(args.key, args.value);
});
ipcMain.on('prefs:get', (e, key) => {
  console.log(`prefs:get for key ${key} is ${settingsStorage.get(key)}`);
  e.returnValue = settingsStorage.get(key);
});








//
//
// Errors and Warnings from Modules that need to get UI attention
//
//
//
ipcMain.on('error:uierror', ( ev, data ) => {
  console.error("ipcMain got uierror: " + ev.data);
});
ipcMain.on('error:uiwarn', ( ev, data ) => {
  console.warn("ipcMain got uiwarn: " + ev.data);
});







// Regarding the app name showing as electron:
// https://stackoverflow.com/questions/41551110/unable-to-override-app-name-on-mac-os-electron-menu

// Create menu template
const mainMenuTemplate = [
  {
    label:'File',
    submenu: [
      {
        label: 'File Thing 1',
        click(){
          createAddWindow();
        }
      },
      {
        label: 'File Thing 2',
        click(){
          mainWindow.webContents.send('item:clear');
        }
      },
      {
        label: 'Quit',
        accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q',
        click() {
          app.quit();
        }
      }
    ]
  }
];

// Because in darwin, first menu item is that top left thing that might
// even just say "Electron" of the app name etc.
if (process.platform === 'darwin') {

  //mainMenuTemplate.unshift({}); // nogo

  // Still shows "electron" top left on Mac unless re-package
  mainMenuTemplate.unshift({
    label: app.getName(),
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideothers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  })


  // Edit menu
  /*
  mainMenuTemplate[1].submenu.push(
    { type: 'separator' },
    {
      label: 'Speech',
      submenu: [
        { role: 'startspeaking' },
        { role: 'stopspeaking' }
      ]
    }
  )

  // Window menu
  mainMenuTemplate[3].submenu = [
    { role: 'close' },
    { role: 'minimize' },
    { role: 'zoom' },
    { type: 'separator' },
    { role: 'front' }
  ]
  */
}

// Add developer tools item if not in prod
if(process.env.NODE_ENV !== 'production'){
  mainMenuTemplate.push({
    label: 'Developer Tools',
    submenu: [
      {
        label: 'Toggle DevTools',
        accelerator: process.platform === 'darwin' ? 'Command+I' : 'Ctrl+I',
        click(item, focusedWindow){
          focusedWindow.toggleDevTools();
          var dts = settingsStorage.get('devToolsOpen');
          settingsStorage.set('devToolsOpen', !dts);
          console.log(`setting:devToolsOpen was ${dts} and was now set to ${!dts}`); // this will go to terminal when running from source
        }
      },
      {
        role: 'reload'
      }
    ]
  });
}
