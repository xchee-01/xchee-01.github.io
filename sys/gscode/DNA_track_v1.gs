// Google Apps Script code - deploy as a web app to create an API endpoint

function doGet(e) {
  // Set CORS headers for the preflight request
  return handleResponse(e);
}

function doPost(e) {
  // Set CORS headers for the main request
  return handleResponse(e);
}

function handleResponse(e) {
  // Allow requests from any origin
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    // Parse the incoming data
    var data;
    if (e.postData && e.postData.contents) {
      // Handle POST request
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      // Handle GET request with parameters
      data = e.parameter;
    } else {
      // No data provided
      output.setContent(JSON.stringify({ 
        success: false, 
        error: "No data provided" 
      }));
      return output;
    }
    
    // Log the visit
    var result = logPageVisit(
      data.username || "Unknown", 
      data.accessTime || new Date().toString(), 
      data.url || "Unknown", 
      data.userAgent || "Unknown"
    );
    
    // Return the result
    output.setContent(JSON.stringify(result));
    return output;
    
  } catch (error) {
    // Handle errors
    output.setContent(JSON.stringify({ 
      success: false, 
      error: error.toString() 
    }));
    return output;
  }
}

function logPageVisit(username, accessTime, url, userAgent) {
  try {
    // Open the specific spreadsheet using its ID
    const ss = SpreadsheetApp.openById('1ks1d7AF-nSezGvl2ZuoxjMkAQteDmpjzNPN14WNum6k');
    
    // Access the "page_track" sheet
    let sheet = ss.getSheetByName('page_track');
    
    if (!sheet) {
      Logger.log('Sheet "page_track" not found. Creating it.');
      // Create the sheet if it doesn't exist
      sheet = ss.insertSheet('page_track');
      sheet.appendRow(['Timestamp', 'Username', 'Access Time', 'URL', 'User Agent', 'IP Address']);
    }
    
    // Add the data to the next row
    sheet.appendRow([
      new Date(), // Server timestamp
      username,
      accessTime,
      url,
      userAgent,
      'GitHub Hosted' // IP address isn't available for GitHub hosted pages
    ]);
    
    return {success: true, message: "Visit logged successfully"};
  } catch (error) {
    Logger.log('Error in logPageVisit: ' + error.toString());
    return {success: false, error: error.toString()};
  }
}
