/**
 * Google Apps Script to import account data from JSON to Google Sheets
 * Spreadsheet ID: 1ks1d7AF-nSezGvl2ZuoxjMkAQteDmpjzNPN14WNum6k
 * Sheet Name: Username
 * Web app URL: https://script.google.com/macros/s/AKfycbz08ltIsyANBgZKCJLcrvz2bXU68tidJ1agsFMPYNL1OND1rJc3SYJUqYh4eQpuIW-o/exec
 */

/**
 * Handles GET requests - either returns info or processes data if provided in query
 */
function doGet(e) {
  // Check if data is provided in the URL parameters
  if (e.parameter && e.parameter.data) {
    try {
      const jsonData = JSON.parse(decodeURIComponent(e.parameter.data));
      
      // Process the data
      const result = processAccountData(jsonData);
      
      // Return HTML response with result
      return HtmlService.createHtmlOutput(`
        <!DOCTYPE html>
        <html>
        <head>
          <base target="_top">
          <meta charset="UTF-8">
          <title>Import Result</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background-color: #f8f9fa;
              text-align: center;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.12);
            }
            h1 {
              color: #202124;
            }
            .message {
              font-size: 18px;
              margin: 20px 0;
              padding: 15px;
              border-radius: 4px;
            }
            .success {
              background-color: #e6f4ea;
              color: #137333;
            }
            .error {
              background-color: #fce8e6;
              color: #c5221f;
            }
            .close-btn {
              background-color: #1a73e8;
              color: white;
              border: none;
              padding: 10px 24px;
              font-size: 14px;
              border-radius: 4px;
              cursor: pointer;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Data Import Result</h1>
            <div class="message ${result.status === 'success' ? 'success' : 'error'}">
              ${result.message}
            </div>
            <button class="close-btn" onclick="window.close()">Close</button>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      // Return HTML with error message
      return HtmlService.createHtmlOutput(`
        <!DOCTYPE html>
        <html>
        <head>
          <base target="_top">
          <meta charset="UTF-8">
          <title>Import Error</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background-color: #f8f9fa;
              text-align: center;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.12);
            }
            h1 {
              color: #202124;
            }
            .message {
              font-size: 18px;
              margin: 20px 0;
              padding: 15px;
              border-radius: 4px;
              background-color: #fce8e6;
              color: #c5221f;
            }
            .close-btn {
              background-color: #1a73e8;
              color: white;
              border: none;
              padding: 10px 24px;
              font-size: 14px;
              border-radius: 4px;
              cursor: pointer;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Data Import Error</h1>
            <div class="message">
              Error processing data: ${error.message}
            </div>
            <button class="close-btn" onclick="window.close()">Close</button>
          </div>
        </body>
        </html>
      `);
    }
  }

  // If no data provided, return default HTML page
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <meta charset="UTF-8">
      <title>Import Account Data</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        }
        h1 {
          color: #202124;
          text-align: center;
        }
        p {
          line-height: 1.5;
        }
        .note {
          background-color: #e8f0fe;
          padding: 15px;
          border-radius: 4px;
          margin-top: 20px;
          border-left: 4px solid #1a73e8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Account Data Import Tool</h1>
        <p>This web app allows you to import account data from local storage to a Google Sheet.</p>
        <p>To use this tool:</p>
        <ol>
          <li>Use the Local Storage Viewer page to view your stored accounts</li>
          <li>Click the "Export to Google Sheet" button</li>
          <li>The data will be automatically imported</li>
        </ol>
        <div class="note">
          <strong>Note:</strong> This page is meant to be accessed from the Local Storage Viewer HTML. 
          If you're seeing this page directly, you should return to the viewer and click the export button.
        </div>
      </div>
    </body>
    </html>
  `);
}

/**
 * Handles POST requests - imports account data to the sheet
 */
function doPost(e) {
  try {
    let jsonData;
    
    // Check if data is in the payload parameter (form submission)
    if (e.parameter && e.parameter.payload) {
      try {
        jsonData = JSON.parse(e.parameter.payload);
      } catch (parseError) {
        // Log the error and the actual content for debugging
        Logger.log("Error parsing payload: " + parseError.message);
        Logger.log("Payload content: " + e.parameter.payload);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Failed to parse payload: ' + parseError.message
        })).setMimeType(ContentService.MimeType.JSON);
      }
    } 
    // Check if data is in the raw post data (direct JSON post)
    else if (e.postData && e.postData.contents) {
      try {
        jsonData = JSON.parse(e.postData.contents);
      } catch (parseError) {
        Logger.log("Error parsing post data: " + parseError.message);
        Logger.log("Post data content: " + e.postData.contents);
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Failed to parse post data: ' + parseError.message
        })).setMimeType(ContentService.MimeType.JSON);
      }
    } 
    else {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No data received'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Log the data received for debugging
    Logger.log('Received data: ' + JSON.stringify(jsonData));
    
    // Call the shared function to process the data
    const result = processAccountData(jsonData);
    
    // Return the result
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // Log error for debugging
    Logger.log(`Error processing request: ${error.message}`);
    Logger.log(`Stack trace: ${error.stack}`);
    
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Shared function to process account data and add it to the sheet
 */
function processAccountData(jsonData) {
  try {
    // Access the spreadsheet
    const spreadsheetId = '1ks1d7AF-nSezGvl2ZuoxjMkAQteDmpjzNPN14WNum6k';
    const sheetName = 'Username';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    let sheet = spreadsheet.getSheetByName(sheetName);
    
    // Create the sheet if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
      sheet.appendRow(['Username', 'Password', 'Import Date']);
    }
    
    // Check if we have any data to import
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return {
        status: 'error',
        message: 'No valid data received'
      };
    }
    
    // Prepare data for import with current timestamp
    const now = new Date().toISOString();
    const dataToImport = jsonData.map(account => [
      account.username || 'Unknown',
      account.password || 'Unknown',
      now
    ]);
    
    // Get the next empty row
    const lastRow = Math.max(sheet.getLastRow(), 1);
    const startRow = lastRow + 1;
    
    // Write the data
    sheet.getRange(startRow, 1, dataToImport.length, 3).setValues(dataToImport);
    
    // Log success message
    Logger.log(`Successfully imported ${dataToImport.length} account(s).`);
    
    // Return success response
    return {
      status: 'success',
      message: `Imported ${dataToImport.length} account(s).`
    };
    
  } catch (error) {
    // Log error for debugging
    Logger.log(`Error importing data: ${error.message}`);
    Logger.log(`Stack trace: ${error.stack}`);
    
    // Return error response
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Manual function to import test data (can be run from the script editor)
 */
function importAccountData() {
  // Test data - you can modify this as needed
  const jsonData = [
    {"username": "test1", "password": "pass1"}
  ];
  
  try {
    // Use the shared processing function
    const result = processAccountData(jsonData);
    
    // Log the result
    Logger.log(`Result: ${JSON.stringify(result)}`);
    
  } catch (error) {
    Logger.log(`Error in importAccountData: ${error.message}`);
  }
}
