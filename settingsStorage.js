//
// settingsStorage.js
//

 //
// For storing user settings locally
//
// Please see, and thanks to the fundamental concept and demo code presented
// at:
// https://cameronnokes.com/blog/how-to-store-user-data-in-electron/
// or his other articles and/or presentations.  There are others as well.
//

//
// Needs:
//
// 1. Reset-able to nothing / clear it out / delete?
// 2. User can see the location for manual cleaning out of files (or edit)
// 3.
//

//
// This is the first file / functionality set for which we are using testing Tests
//






const electron = require('electron');
const path = require('path');
const fs = require('fs');



class SettingsStorage {
  constructor(options) {  // can we use defaults here? a la ES6 / 2015?

    // Note for implementation: dependin on main.js or if in mainWindow (probably
    // the former ...) - maybe ... anyway, here: "||"
    // Renderer process has to get `app` module via `remote`, whereas the main process can get it directly
    const userDataPath = (electron.app || electron.remote.app).getPath('userData');
    console.log("SettingsStorage: userDataPath is: " + userDataPath);

    this.path = path.join(userDataPath, options.settingsFileName + '.json');

    this.data = parseDataFile(this.path, options.defaults);
  }

  // Get(ter)
  get(key) {
    return this.data[key];
  }

  // Set(ter)
  set(key, val) {
    this.data[key] = val;
    // Wait, I thought using the node.js' synchronous APIs was bad form?
    // We're not writing a server so there's not nearly the same IO demand on the process
    // Also if we used an async API and our app was quit before the asynchronous write had a chance to complete,
    // we might lose that data. Note that in a real app, we would try/catch this.
    // Also - in our nodejs version as implemented at this time for the DacqMan
    // demo app, Sync may not be available ...
    fs.writeFileSync(this.path, JSON.stringify(this.data));
  }


  // Get filepath
  getFilePath() {
    return this.path;
  }

  // Return all prefs
  getAll() {
    return this.data;
  }

  // Force save eg for re-instantiation
  forceSave() {
    fs.writeFileSync(this.path, JSON.stringify(this.data));
  }
}

function parseDataFile(filePath, defaults) {
  // We'll try/catch it in case the file doesn't exist yet, which will be the case on the first application run.
  // `fs.readFileSync` will return a JSON string which we then parse into a Javascript object

  try {

    var j = JSON.parse(fs.readFileSync(filePath));
    console.log("Current settings from file: ");
    console.log(j);

    // Now verify that each default key exists or insert as needed if not yet existing
    // This is to help migration without having to reset all to defaults
    var pjdefs = JSON.parse(JSON.stringify(defaults));

    for ( var defkey in pjdefs ) {
      //console.log(defkey);
      //console.log(pjdefs[defkey]);
      //console.log(j[defkey]);
      if ( !j[defkey] ) {
        console.log("No key found in settings for: " + defkey + " ... inserting default");
        j[defkey] = pjdefs[defkey];
      }
    }

    console.log("After checking/updating settings: ");
    console.log(j);

    return j;

  } catch(error) {

    // if there was some kind of error, return the passed in defaults instead.
    console.log("settingsStorage.js: error: " + error + " returning default settings");
    return defaults;

  }




}

// expose the class
module.exports = SettingsStorage;
