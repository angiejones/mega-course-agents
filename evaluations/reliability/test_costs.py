import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from costs import jev_cost,run_costs

class CostsTest(unittest.TestCase):
 def test_two_criteria_are_one_call(self):
  call={'model':'jev-1.13.0','usage':{'input_tokens':2000,'output_tokens':100},'answers':{'grounded':{},'next_step':{}}}
  self.assertEqual(jev_cost([call])['calls'],1)
  self.assertAlmostEqual(jev_cost([call])['usd'],.000084)
 def test_missing_and_unknown_are_not_free(self):
  self.assertIsNone(jev_cost(None)['usd'])
  for call in [{'model':'jev-1.13.0','usage':None},{'model':'future','usage':{'input_tokens':2000}},{'model':'jev-1.13.0','status':'failed','usage':{'input_tokens':2000}}]:
   self.assertIsNone(jev_cost([call])['usd'])
 def test_zero_calls_is_zero_cost(self):
  self.assertEqual(jev_cost([])['usd'],0)
 def test_execution_evaluation_separate(self):
  e={'events':[{'runtime':{'model':'openai/gpt-6-luna'}},{'usage':{'inputTokens':1000,'outputTokens':100,'cachedInputTokens':200,'cacheCreationInputTokens':100},'jevCalls':[{'model':'jev-1.13.0','usage':{'input_tokens':100,'output_tokens':10}}]}]}
  scorer={'model':'jev-1.13.0','usage':{'input_tokens':2000,'output_tokens':100}}
  c=run_costs(e,[scorer])
  self.assertAlmostEqual(c['execution']['agentUsd'],.0001345)
  self.assertAlmostEqual(c['execution']['totalUsd'],.0001387)
  self.assertAlmostEqual(c['evaluation']['usd'],.000084)
  del e['events'][1]['jevCalls']
  c=run_costs(e,[])
  self.assertIsNone(c['execution']['totalUsd'])
  self.assertIsNone(c['evaluation'])
if __name__=='__main__':unittest.main()
