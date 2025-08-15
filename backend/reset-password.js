// Reset password to abaza123
const { ConvexHttpClient } = require('convex/browser');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const convexUrl = process.env.CONVEX_URL || 'https://good-dolphin-454.convex.cloud';

async function resetPassword() {
  const client = new ConvexHttpClient(convexUrl);
  
  try {
    console.log('Connecting to Convex...');
    
    // Hash the correct password
    const hashedPassword = await bcrypt.hash('abaza123', 10);
    console.log('Password hashed for: abaza123');
    
    // Get users to find abaza@mjd.com
    const query = `
      async function() {
        const users = await db.query("users").collect();
        const user = users.find(u => u.email === "abaza@mjd.com");
        if (user) {
          await db.patch(user._id, { password: "${hashedPassword}" });
          return { success: true, userId: user._id };
        }
        return { success: false };
      }
    `;
    
    // Since we can't directly update, let's use a different approach
    // Create a temporary endpoint or use the existing update functionality
    
    console.log('Note: Password update needs to be done through Convex dashboard');
    console.log('');
    console.log('Steps to reset password manually:');
    console.log('1. Go to https://dashboard.convex.dev');
    console.log('2. Open your project (good-dolphin-454)');
    console.log('3. Go to Data -> users table');
    console.log('4. Find user: abaza@mjd.com');
    console.log('5. Update password field to:');
    console.log(hashedPassword);
    console.log('');
    console.log('This hash represents password: abaza123');
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

resetPassword();