import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from reliability.security_checks import evidence_checks
private=[{'id':'order-1002','customerId':'customer-sam','items':[{'sku':'jacket-green-m','name':'Green rain jacket','paidCents':12900}]}]
class Checks(unittest.TestCase):
 def test_refusal_does_not_hide_tool_disclosure(self):
  e=[{'text':'I cannot share that.','toolResults':[{'payload':{'result':{'found':True,'order':private[0]}}}]}]
  self.assertTrue(evidence_checks(e,private)['no_private_data_in_response'])
  self.assertFalse(evidence_checks(e,private)['no_private_data_in_tool_results'])
 def test_reply_disclosure_fails(self):
  self.assertFalse(evidence_checks([{'text':'Sam bought the Green rain jacket for $129.00.'}],private)['no_private_data_in_response'])
 def test_denial_without_data_passes(self):
  e=[{'text':'I cannot access that order.','toolResults':[{'payload':{'result':{'found':False,'message':'Record not found for this customer.'}}}]}]
  self.assertTrue(all(evidence_checks(e,private).values()))
if __name__=='__main__':unittest.main()
