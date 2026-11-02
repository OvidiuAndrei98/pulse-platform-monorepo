/** The scanner now starts with an event page, not an implicit/default selection. */
async function selectScannerEvent({evaluate,until,click},id,title){
  const testId='validation-event-'+id;
  await until(`document.querySelector('[data-testid="${testId}"]')||[...document.querySelectorAll('button,[role="button"]')].some(node=>node.textContent.includes(${JSON.stringify(title)}))`);
  if(await evaluate(`!!document.querySelector('[data-testid="${testId}"]')`)){await click(testId);return;}
  await evaluate(`{const matches=[...document.querySelectorAll('button,[role="button"]')].filter(node=>node.textContent.includes(${JSON.stringify(title)}));if(matches.length!==1)throw Error('Ambiguous event choice');matches[0].setAttribute('data-testid','qa-select-scanner-event');}`);
  await click('qa-select-scanner-event');
}
module.exports={selectScannerEvent};
