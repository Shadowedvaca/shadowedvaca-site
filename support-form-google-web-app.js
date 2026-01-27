// Configuration - UPDATE THESE VALUES
const SPREADSHEET_ID = '1f_tq2DPCj2Q1NbAlWI0_280FohpNi22xGevcNXcKkE8';
const NOTIFICATION_EMAIL = 'contact@shadowedvaca.com';
const SHEET_NAME = 'Sheet1'; // Change if your sheet has a different name

/**
 * Handles POST requests from the support form
 */
function doPost(e) {
  try {
    // Parse the incoming JSON data
    const data = JSON.parse(e.postData.contents);
    
    // Save to spreadsheet
    saveToSheet(data);
    
    // Send email notification
    sendEmailNotification(data);
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error processing request:', error);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Saves the form data to the Google Sheet
 */
function saveToSheet(data) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  
  // Format timestamp for readability
  const timestamp = new Date(data.timestamp).toLocaleString('en-US', {
    timeZone: 'America/Phoenix', // Change to your timezone
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Append row with form data
  sheet.appendRow([
    timestamp,
    data.name,
    data.email,
    data.device,
    data.osVersion,
    data.issueType,
    data.description,
    'New' // Status column - useful for tracking
  ]);
}

/**
 * Sends an email notification about the new support request
 */
function sendEmailNotification(data) {
  const subject = `[Meandering Muck Support] ${data.issueType} - ${data.device}`;
  
  const body = `
New support request received!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTACT INFO
Name: ${data.name}
Email: ${data.email}

DEVICE INFO
Device: ${data.device}
OS Version: ${data.osVersion}

ISSUE
Type: ${data.issueType}

Description:
${data.description}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reply directly to this email to respond to the customer.

View all requests: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}
  `.trim();
  
  // Send email with reply-to set to the customer's email
  GmailApp.sendEmail(NOTIFICATION_EMAIL, subject, body, {
    replyTo: data.email,
    name: 'Meandering Muck Support'
  });
}

/**
 * Test function - run this to verify your setup works
 */
function testSubmission() {
  const testData = {
    timestamp: new Date().toISOString(),
    name: 'Test User',
    email: 'test@example.com',
    device: 'iPhone 15 Pro',
    osVersion: 'iOS 18.2',
    issueType: 'Controls',
    description: 'This is a test submission to verify the support form is working correctly.'
  };
  
  saveToSheet(testData);
  sendEmailNotification(testData);
  
  console.log('Test completed! Check your spreadsheet and email.');
}

/**
 * Handles GET requests (optional - shows a simple status page)
 */
function doGet(e) {
  return ContentService
    .createTextOutput('Meandering Muck Support Form Handler is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}