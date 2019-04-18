const electron = require('electron');
const url = require('url');
const path = require('path');

const {app, BrowserWindow, Menu, ipcMain} = electron;

// SET ENV
process.env.NODE_ENV = 'development';//'production'; // lose the devtools etc.

let mainWindow;
let addWindow;


// Listenfor the app to be ready
app.on('ready', function(){
  // Create new mainWindow
  mainWindow = new BrowserWindow({
    width: 800,
    height: 900,
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
  mainWindow.webContents.send('port:ondata', data);
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
        }
      },
      {
        role: 'reload'
      }
    ]
  });
}
