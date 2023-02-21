// spec.js

// see please:
// https://livebook.manning.com/book/electron-in-action/chapter-13/38
//

const assert = require('assert');
const path = require('path');
const Application = require('spectron').Application;

var electronPath = require('electron');
electronPath = path.join(__dirname, "../node_modules", ".bin", "electron");

const app = new Application({
  path: electronPath,
  args: [path.join(__dirname, '..')],
});

let devToolsIsOpen = false;

// REFS:
// https://www.atmosera.com/blog/end-end-testing-electron-apps-spectron/
//

describe('dacqman launch', function () {

  this.timeout(10000);

  console.log(`app.path: ${app.path}`);

  beforeEach(() => {
    return app.start();
  });

  afterEach(() => {
    if (app && app.isRunning()) {
      return app.stop();
    }
  });

  // it('has the correct title', async () => {
  //   const title = await app.client.waitUntilWindowLoaded().getTitle();
  //   var tf = title.includes('DacqMan') ? true : false;
  //   return assert(tf);
  // });

  // https://livebook.manning.com/book/electron-in-action/chapter-13/61
  // not really a test - just to determine window count
  // it('has the developer tools open', async () => {
  //   const devToolsAreOpen = await app.client
  //     .waitUntilWindowLoaded()
  //     .browserWindow.isDevToolsOpened();
  //   devToolsIsOpen = devToolsAreOpen;
  //   return assert.equal(devToolsAreOpen, true);
  // });
  
  // it('shows correct initial window count', async () => {
  //   const devToolsAreOpen = await app.client
  //     .waitUntilWindowLoaded()
  //     .browserWindow.isDevToolsOpened();
  //   devToolsIsOpen = devToolsAreOpen;
  //   const count = await app.client.getWindowCount();
  //   if ( devToolsIsOpen ) {
  //     return assert.equal(count, 2); 
  //   } else {
  //     return assert.equal(count, 1); 
  //   }
  // });

  it('hardware not yet determined', async () => {
    const b = await app.client.getText('#serialPortGoButton');
    console.log(b)
  });

});



