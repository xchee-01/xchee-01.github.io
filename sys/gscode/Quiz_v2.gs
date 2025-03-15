// Google Apps Script to handle quiz data

function doGet(e) {
  try {
    // If the 'test' parameter is provided, run the test function
    if (e && e.parameter && e.parameter.test === 'true') {
      const result = runTest();
      return HtmlService.createHtmlOutput(`Test completed: ${result.message}`);
    }
    
    return HtmlService.createHtmlOutput(
      "This is a POST-only web app for handling quiz data.<br><br>" +
      "To run a test, append ?test=true to the URL."
    );
  } catch (error) {
    return HtmlService.createHtmlOutput(`Error: ${error.message}`);
  }
}

function doPost(e) {
  try {
    // Log the incoming data for debugging
    Logger.log("Received POST data: " + e.postData.contents);
    
    // Parse the incoming JSON data
    const postData = JSON.parse(e.postData.contents);
    
    // Get the spreadsheet
    const ss = SpreadsheetApp.openById("1ks1d7AF-nSezGvl2ZuoxjMkAQteDmpjzNPN14WNum6k");
    Logger.log("Successfully opened spreadsheet");
    
    // Get or create the quiz sheet
    let sheet = ss.getSheetByName("quiz");
    if (!sheet) {
      Logger.log("Creating new 'quiz' sheet");
      sheet = ss.insertSheet("quiz");
    } else {
      Logger.log("Found existing 'quiz' sheet");
    }
    
    // Process the data
    if (postData.questionData && postData.questionData.length > 0) {
      Logger.log("Processing question data, found " + postData.questionData.length + " questions");
      
      // Ensure headers - added URL to the headers
      const headers = ["Timestamp", "Username", "URL", "Question Number", "Student Answer", "Time Taken to Answer", "Correct?"];
      const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      const isEmpty = firstRow.every(cell => cell === "");
      
      if (isEmpty) {
        Logger.log("Adding headers to sheet");
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      
      // Add data rows
      const timestamp = new Date().toISOString();
      const username = postData.username || "Anonymous";
      const url = postData.url || "Unknown URL";
      
      Logger.log("Adding " + postData.questionData.length + " rows to the sheet");
      postData.questionData.forEach(question => {
        try {
          sheet.appendRow([
            timestamp,
            username,
            url,
            question.questionNumber,
            question.selectedText,
            question.timeSpent,
            question.isCorrect
          ]);
          Logger.log("Successfully added row for question " + question.questionNumber);
        } catch (rowError) {
          Logger.log("Error adding row: " + rowError.message);
        }
      });
    } else {
      Logger.log("No question data found in the request");
    }
    
    // Return success response
    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", message: "Data saved successfully" })
    ).setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log("Error processing request: " + error.message);
    
    // Return error response
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Test function to verify that data is being added to the correct sheet
 */
function runTest() {
  try {
    Logger.log("Starting test function");
    
    // Get the spreadsheet
    const ss = SpreadsheetApp.openById("1ks1d7AF-nSezGvl2ZuoxjMkAQteDmpjzNPN14WNum6k");
    Logger.log("Successfully opened spreadsheet for test");
    
    // Get or create the quiz sheet
    let sheet = ss.getSheetByName("quiz");
    if (!sheet) {
      Logger.log("Creating new 'quiz' sheet for test");
      sheet = ss.insertSheet("quiz");
    } else {
      Logger.log("Found existing 'quiz' sheet for test");
    }
    
    // Ensure headers - added URL to the headers
    const headers = ["Timestamp", "Username", "URL", "Question Number", "Student Answer", "Time Taken to Answer", "Correct?"];
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const isEmpty = firstRow.every(cell => cell === "");
    
    if (isEmpty) {
      Logger.log("Adding headers to sheet for test");
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    
    // Create test data
    const testData = [
      {
        timestamp: new Date().toISOString(),
        username: "TEST_USER",
        url: "https://example.com/dna-quiz",
        questionNumber: 1,
        selectedText: "b) Deoxyribonucleic Acid",
        timeSpent: 15,
        isCorrect: "Yes"
      },
      {
        timestamp: new Date().toISOString(),
        username: "TEST_USER",
        url: "https://example.com/dna-quiz",
        questionNumber: 2,
        selectedText: "c) James Watson and Francis Crick",
        timeSpent: 20,
        isCorrect: "Yes"
      }
    ];
    
    // Add test data to the sheet
    Logger.log("Adding test data to sheet");
    testData.forEach(row => {
      try {
        sheet.appendRow([
          row.timestamp,
          row.username,
          row.url,
          row.questionNumber,
          row.selectedText,
          row.timeSpent,
          row.isCorrect
        ]);
        Logger.log("Successfully added test row for question " + row.questionNumber);
      } catch (rowError) {
        Logger.log("Error adding test row: " + rowError.message);
      }
    });
    
    // Add a marker to indicate this was a test
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(lastRow-1, 1, 2, 7).setBackground("#FFF2CC");
      Logger.log("Highlighted test rows");
    }
    
    return { 
      success: true, 
      message: "Test data added successfully to the 'quiz' sheet. Check your spreadsheet for rows with username 'TEST_USER'." 
    };
  } catch (error) {
    Logger.log("Test failed: " + error.message);
    return { 
      success: false, 
      message: "Test failed: " + error.message 
    };
  }
}

function manualTest() {
  const result = runTest();
  Logger.log("Manual test result: " + result.message);
  return result;
}
