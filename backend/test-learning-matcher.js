const { LearningMatcherService } = require('./dist/services/learningMatcher.service');
const { MatchingService } = require('./dist/services/matching.service');
const { getConvexClient } = require('./dist/config/convex');

async function testLearningMatcher() {
  console.log('🧪 Testing Learning Matcher System');
  console.log('==================================\n');

  const learningMatcher = LearningMatcherService.getInstance();
  const matchingService = MatchingService.getInstance();

  // Test scenarios
  const testItems = [
    {
      description: "Excavation for foundation in ordinary soil",
      expectedMatch: "Excavation work",
      contextHeaders: ["EARTHWORK", "EXCAVATION"]
    },
    {
      description: "Supply and install 20mm thick marble flooring",
      expectedMatch: "Marble flooring installation",
      contextHeaders: ["FLOORING", "MARBLE"]
    },
    {
      description: "RCC M25 grade concrete for columns",
      expectedMatch: "Reinforced concrete work",
      contextHeaders: ["CONCRETE", "STRUCTURAL"]
    }
  ];

  console.log('📝 Simulating manual edits to train the system...\n');

  // Simulate manual edits (training the system)
  for (const item of testItems) {
    console.log(`Training with: "${item.description.substring(0, 50)}..."`);
    
    // Record a simulated manual edit
    await learningMatcher.recordManualEdit(
      item.description,
      'test_item_id_' + Math.random(),
      {
        description: item.expectedMatch,
        code: 'TEST001',
        unit: 'm3',
        rate: 1000
      },
      0.95, // High confidence for manual edits
      item.contextHeaders,
      'test_user_id',
      'test_job_id',
      'test_project_id'
    );
    
    console.log(`✅ Recorded pattern for: ${item.expectedMatch}\n`);
  }

  console.log('\n🔍 Testing pattern recognition with similar items...\n');

  // Test with similar items
  const testQueries = [
    {
      description: "Excavation for foundation in hard soil",
      contextHeaders: ["EARTHWORK", "EXCAVATION"]
    },
    {
      description: "Supply & fix 25mm thick marble flooring",
      contextHeaders: ["FLOORING", "MARBLE"]
    },
    {
      description: "RCC M30 grade concrete for beams",
      contextHeaders: ["CONCRETE", "STRUCTURAL"]
    },
    {
      description: "Something completely different - electrical wiring",
      contextHeaders: ["ELECTRICAL", "WIRING"]
    }
  ];

  for (const query of testQueries) {
    console.log(`\nTesting: "${query.description}"`);
    console.log(`Context: ${query.contextHeaders.join(' > ')}`);
    
    try {
      // Test with learning
      const learnedMatch = await learningMatcher.matchWithLearning(
        query.description,
        'LOCAL',
        null,
        query.contextHeaders,
        'test_user_id',
        'test_job_id'
      );

      // Test without learning (regular match)
      const regularMatch = await matchingService.matchItem(
        query.description,
        'LOCAL',
        null,
        query.contextHeaders
      );

      console.log(`\n  Learning Match:`);
      console.log(`    Method: ${learnedMatch.method}`);
      console.log(`    Confidence: ${(learnedMatch.confidence * 100).toFixed(1)}%`);
      console.log(`    Description: ${learnedMatch.matchedDescription}`);
      
      console.log(`\n  Regular Match:`);
      console.log(`    Method: ${regularMatch.method}`);
      console.log(`    Confidence: ${(regularMatch.confidence * 100).toFixed(1)}%`);
      console.log(`    Description: ${regularMatch.matchedDescription}`);

      if (learnedMatch.method === 'LEARNED' || learnedMatch.method === 'LOCAL_LEARNED') {
        console.log(`\n  ✨ Learning system improved the match!`);
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }

  console.log('\n\n📊 Pattern Statistics:');
  const stats = await learningMatcher.getPatternStatistics();
  console.log(`  Total Patterns: ${stats.totalPatterns}`);
  console.log(`  Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
  console.log(`  Most Used Patterns: ${stats.mostUsedPatterns.length}`);

  console.log('\n✅ Learning Matcher Test Complete!\n');
}

// Run the test
testLearningMatcher().catch(console.error);