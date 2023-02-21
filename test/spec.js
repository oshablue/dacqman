// spec.js

// see please:
// https://livebook.manning.com/book/electron-in-action/chapter-13/38
// https://www.npmjs.com/package/spectron/v/6.0.0
// http://v4.webdriver.io/api/utility/waitForExist.html
// https://www.atmosera.com/blog/end-end-testing-electron-apps-spectron/
// https://livebook.manning.com/book/electron-in-action/chapter-13/6


const assert = require('assert');
const path = require('path');
const Application = require('spectron').Application;

var electronPath = require('electron');
electronPath = path.join(__dirname, "../node_modules", ".bin", "electron");
if ( process.platform === "win32" ) {
  electronPath += ".cmd";
}

const app = new Application({
  path: electronPath,
  args: [path.join(__dirname, '..')],
});

let devToolsIsOpen = false;



describe('dacqman launch', function () {

  this.timeout(20000);

  console.log(`app.path: ${app.path}`);

  beforeEach(() => {
    return app.start();
  });

  afterEach(() => {
    if (app && app.isRunning()) {
      return app.stop();
    }
  });

  it('has the correct title', async () => {
    const title = await app.client.waitUntilWindowLoaded().getTitle();
    var tf = title.includes('DacqMan') ? true : false;
    return assert(tf);
  });
  
  it('shows correct initial window count', async () => {
    const devToolsAreOpen = await app.client
      .waitUntilWindowLoaded()
      .browserWindow.isDevToolsOpened();
    devToolsIsOpen = devToolsAreOpen;
    const count = await app.client.getWindowCount();
    console.log(`window count: ${count}`);
    if ( devToolsIsOpen ) {
      return assert.equal(count, 2); 
    } else {
      return assert.equal(count, 1); 
    }
  });

  it('check if exists and text of serialPortGoButton (fail means no recognized device physically connected for dacqman to use', async () => {
    await app.client.waitForExist('#serialPortGoButton', 20000); // takes a really long time in Win 10 VM!
    const b = await app.client.getText('#serialPortGoButton');
    console.log(b)
  });

});



