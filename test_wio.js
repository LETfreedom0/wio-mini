
const wioService = require('./utils/wioService.js').default;

// Mock uni object
global.uni = {
  getStorageSync: (key) => {
    if (key === 'wio_entries') {
        // Mock data for 2024-05 (May 2024)
        // May 2024 starts on Wednesday.
        // Days: 31.
        // Weekends: 4,5, 11,12, 18,19, 25,26. Total 8 weekend days.
        // Working days (Mon-Fri): 31 - 8 = 23 days.
        
        // Let's set some entries
        const data = {
            '2024-05-01': 'company', // Wed (Working)
            '2024-05-02': 'home',    // Thu (Working)
            '2024-05-03': 'vacation',// Fri (Working)
            '2024-05-06': 'sick',    // Mon (Working)
            '2024-05-07': 'unpaid',  // Tue (Working)
            '2024-05-08': 'comp_off',// Wed (Working)
            '2024-05-09': 'public',  // Thu (Working)
            '2024-05-10': 'company', // Fri (Working)
            // Total marked: 8
        };
        return JSON.stringify(data);
    }
    return null;
  }
};

const stats = wioService.getMonthStats(2024, 5);
console.log('Stats:', stats);

// Verify Formula
// Numerator = companyDays = 2
// Denominator = workingDays - home - public - vacation - sick - unpaid - comp_off
// workingDays = 23
// home = 1
// public = 1
// vacation = 1
// sick = 1
// unpaid = 1
// comp_off = 1
// Denominator = 23 - 1 - 1 - 1 - 1 - 1 - 1 = 17
// Result = 2 / 17 = 11.76%

const numerator = stats.companyDays;
const denominator = stats.workingDays 
                - stats.homeDays 
                - stats.publicDays 
                - stats.vacationDays 
                - stats.sickDays 
                - stats.unpaidDays 
                - stats.compOffDays;

console.log(`Numerator: ${numerator}`);
console.log(`Denominator: ${denominator}`);
console.log(`Result: ${Math.round((numerator / denominator) * 100)}%`);

if (stats.workingDays === 23 && numerator === 2 && denominator === 17) {
    console.log('TEST PASSED');
} else {
    console.log('TEST FAILED');
}
