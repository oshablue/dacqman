// Lovely tutorial:
// https://www.dashingd3js.com/creating-svg-elements-based-on-data
// Additional lovely references:
// https://github.com/bignerdranch/music-frequency-d3/blob/master/app.js
// https://www.bignerdranch.com/blog/music-visualization-with-d3-js/
// http://square.github.io/crossfilter/
// http://christopheviau.com/d3list/gallery.html
// https://stackoverflow.com/questions/18244995/d3-how-to-show-large-dataset
// https://ff.cx/banksafe/
// https://www.developer.com/java/fun-with-d3.js-data-visualization-eye-candy-with-streaming-json.html
// https://bl.ocks.org/boeric/6a83de20f780b42fadb9
// https://www.freecodecamp.org/news/d3-and-canvas-in-3-steps-8505c8b27444/
// https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData
// https://developer.mozilla.org/en-US/docs/Web/API/Window/cancelAnimationFrame
// https://stackoverflow.com/questions/13230487/converting-a-buffer-into-a-readablestream-in-node-js
// https://github.com/samcday/node-stream-buffer
// https://nodejs.org/api/stream.html
// https://www.npmjs.com/package/stream-buffers






var chartContainer = document.getElementById('chart');


var zoom = d3.zoom().scaleExtent([1, 100]);

// Typically uses window.innerHeight / .innerWidth
var chartHeight = 300
var chartWidth = 900
var _margin = 20
var margin = {top: _margin, right: _margin, bottom: _margin, left: _margin}
  , width = chartWidth - margin.left - margin.right // Use the window's width
  , height = chartHeight - margin.top - margin.bottom; // Use the window's height

// The number of datapoints
var n = 4095; //4096 //5000; //2500; //5000;

// 5. X scale will use the index of our data
var xScale = d3.scaleLinear()
    .domain([0, n-1]) // input
    .range([0, width]); // output

// 6. Y scale will use the randomly generate number
var yInputMaxVal = 255;
var yScale = d3.scaleLinear()
    .domain([0, yInputMaxVal]) // input
    .range([height, 0]); // output

// 7. d3's line generator
var line = d3.line()
    .x(function(d, i) { return xScale(i); }) // set the x values for the line generator
    .y(function(d) { return yScale(d); }) // yScale(d.y); }) // set the y values for the line generator
    .curve(d3.curveMonotoneX) // apply smoothing to the line

// 8. An array of objects of length N. Each object has key -> value pair, the key being "y" and the value is a random number
var dataset = []; //= [0x00,0x01,0x03,0x07,0x0f,0x1f,0x3f,0x7f,0xff]; // d3.range(n).map(function(d) { return {"y": d3.randomUniform(1)() } })
var j;
for ( j = 0; j < 4095; j++ ) {
  dataset.push(127 * Math.sin(2*3.14159/4095*j*4) + 127);
}

// 1. Add the SVG to the page and employ #2
/*
var svg = d3.select('#chart').append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    */
/*var zoom = d3.zoom()
  .x(x)
  .y(y)
  .on("zoom", zoomed);*/

var svg = d3.select('#chart')
  .append("div")
  .classed("svg-container", true)
  .append("svg")
  .call(zoom.on("zoom", zoomed))
  .on("dblclick.zoom", null)          // cancels double-clicking to zoom
  .on("dblclick", ourDlbClick)
  // Responsive SVG needs these 2 attributes and no width and height attr.
 .attr("preserveAspectRatio", "xMinYMin meet")
 .attr("viewBox", "0 0 " + chartWidth + " " + chartHeight)
 // Class to make it responsive.
 .classed("svg-content-responsive", true)
 // This, below, works, but does not redraw and lines get thicker etc.
 //.call(d3.zoom().on("zoom", function () {
 //svg.attr("transform", d3.event.transform)

 //}))
 .append("svg")

 .attr("width", chartWidth) //width + margin.left + margin.right)
 .attr("height", chartHeight) //height + margin.top + margin.bottom)
 //.call(zoom)

 .append("g")
 .classed("chartBody", true)
 //.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
 //.attr("transform", "translate(" + (margin.left + margin.right) + "," + (margin.bottom + margin.top) + ")");
 .attr("transform", "translate(" + (margin.left + margin.right) + "," + 0 + ")")

 ;
// Trying instead of above, responsive svg, per:
// https://stackoverflow.com/questions/16265123/resize-svg-when-window-is-resized-in-d3-js


// 3. Call the x axis in a group tag
svg.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(xScale)); // Create an axis component with d3.axisBottom

// 4. Call the y axis in a group tag
svg.append("g")
    .attr("class", "y axis")
    .call(d3.axisLeft(yScale)); // Create an axis component with d3.axisLeft

// 9. Append the path, bind the data, and call the line generator
svg.append("path")
    //.data(dataset) // 10. Binds data to the line // was datum()
    .datum(dataset)
    .attr("class", "line") // Assign a class for styling
    .attr("d", line); // 11. Calls the line generator

// 12. Appends a circle for each datapoint
/*svg.selectAll(".dot")
    .data(dataset)
    .enter().append("circle") // Uses the enter().append() method
    .attr("class", "dot") // Assign a class for styling
    .attr("cx", function(d, i) { return xScale(i) })
    .attr("cy", function(d) { return yScale(d) }) //.y) })
    .attr("r", 3);*/



function ourDlbClick() {
  svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.scale(1).translate(margin.left + margin.right,0));

}


function zoomed() {
  //console.log(d3.event.translate);  // v3
  //console.log(d3.event.scale);      // v3
  console.log(d3.event.transform);    // v5
  var currentTransform = d3.event.transform;

  svg.attr("transform", currentTransform);
  d3.axisBottom().scale(d3.event.transform.rescaleX(xScale));
  d3.axisLeft().scale(d3.event.transform.rescaleY(yScale));





  /*svg.select(".x.axis").call(xAxis);
  svg.select(".y.axis").call(yAxis);
  svg.select(".line")
      .attr("class", "line")
      .attr("d", line);*/

      // Works, but just zooms into the svg, thus eg thicker lines,
      // not good for actual data view zooming
      //svg.attr("transform", d3.event.transform);
}











// From previous explicit call to update data with provided data set
// versus using requestAnimationFrame...
async function update(newdata) {
  // DEBUG ALERT - aborting this function for now
  return;
  //svg.selectAll(".dot").remove();
  svg.selectAll("path.line").remove();
  svg.append("path")
      .datum(newdata) // 10. Binds data to the line
      .attr("class", "line") // Assign a class for styling
      .attr("d", line); // 11. Calls the line generator
  /*
  svg.selectAll(".dot")
      .data(newdata)
      .enter().append("circle") // Uses the enter().append() method
      .attr("class", "dot") // Assign a class for styling
      .attr("cx", function(d, i) { return xScale(i) })
      .attr("cy", function(d) { return yScale(d) }) //.y) })
      .attr("r", 0.02);
  */ // Maybe we don't need all that - just the path for fasterness?
} // update

// Continuous loop to update and pull data
var reqId;
//var chartBuf = Buffer.alloc(4096, 0);
function renderChart() {

  try {

    reqId = requestAnimationFrame(renderChart);

    // Get the latest data snapshot
    svg.selectAll("path.line").remove();
    svg.append("path")
      .datum(chartBuf)
      .attr("class", "line")
      .attr("d", line);
  } catch ( e ) {
    console.log("Error in renderChart: " + e);
  }
  //console.log('c');

}

function cancelRenderChart() {
  cancelAnimationFrame(reqId);
}




module.exports = {
  update: update,
  renderChart: renderChart,
  cancelRenderChart: cancelRenderChart,
};

/*
var data = [0,1,2,3,4,5];

// Set the dimensions of the canvas / graph
var margin = {top: 30, right: 20, bottom: 30, left: 50},
    width = 600 - margin.left - margin.right,
    height = 270 - margin.top - margin.bottom;

// Parse the date / time
var parseDate = d3.time.format("%d-%b-%y").parse;

// Set the ranges
var x = d3.time.scale().range([0, width]);
var y = d3.scale.linear().range([height, 0]);

// Define the axes
var xAxis = d3.svg.axis().scale(x)
    .orient("bottom").ticks(5);

var yAxis = d3.svg.axis().scale(y)
    .orient("left").ticks(5);

// Define the line
var valueline = d3.svg.line()
    .x(function(d,i) { return i; })
    .y(function(d,i) { return d; });

// Adds the svg canvas
var svg = d3.select('#chart') //"body")
    .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform",
              "translate(" + margin.left + "," + margin.top + ")")
    .append("path")
        .attr("class", "line")
        .attr("d", valueline(data));

// Add the X axis
svg.append("g")
  .attr("class", "x axis")
  .attr("transform", "translate(0," + height + ")")
  .call(xAxis);

// Add the Y Axis
svg.append("g")
    .attr("class", "y axis")
    .call(yAxis);

// Scale the range of the data
x.domain(d3.extent(data, function(d,i) { return i; }));
y.domain([0, d3.max(data, function(d,i) { return d; })]);
*/

/*
// Get the data
d3.csv("data.csv", function(error, data) {
    data.forEach(function(d) {
        d.date = parseDate(d.date);
        d.close = +d.close;
    });

    // Scale the range of the data
    x.domain(d3.extent(data, function(d) { return d.date; }));
    y.domain([0, d3.max(data, function(d) { return d.close; })]);

    // Add the valueline path.
    svg.append("path")
        .attr("class", "line")
        .attr("d", valueline(data));

    // Add the X Axis
    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

    // Add the Y Axis
    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

});*/
