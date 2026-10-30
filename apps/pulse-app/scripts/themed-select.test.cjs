const assert=require('node:assert/strict');
const {test}=require('node:test');
const {hooks,modules,find}=require('./helpers/qaHarness.cjs');

function render(props){
  const h=hooks();h.react.useLayoutEffect=h.react.useEffect;
  const {ThemedSelect}=modules({react:h.react,'@/lib/navigation/useBackLayer':{useBackLayer(){}},'./themedSelect.module.css':{default:{root:'root',trigger:'trigger'}}}).load('features/events/form/ThemedSelect');
  return h.render(()=>ThemedSelect({value:'coat',onChange(){},placeholder:'Choose an item',...props}));
}
test('shared select exposes disabled/empty states and its label without an inert-looking enabled action',()=>{
  for(const props of [{options:[]},{options:[{value:'coat',label:'Coats'}],disabled:true}]){
    const button=find(render({...props,label:'Item type'}),node=>node.type==='button');
    assert.equal(button.props.disabled,true);assert.equal(button.props.role,'combobox');assert.equal(button.props['aria-label'],'Item type');
  }
});
test('shared select preserves the controlled form name and value',()=>{
  const node=render({options:[{value:'coat',label:'Coats'}],name:'wardrobe-kind'});
  const field=find(node,node=>node.type==='input');
  assert.equal(field.props.type,'hidden');assert.equal(field.props.name,'wardrobe-kind');assert.equal(field.props.value,'coat');
  assert.equal(find(node,node=>node.type==='button').props.disabled,false);
});
