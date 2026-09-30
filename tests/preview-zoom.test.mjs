import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const start=script.indexOf("  function bindPreviewZoom(");
const helper=script.slice(start,script.indexOf("  async function openPreview(",start));

function classes(initial=[]){
  const values=new Set(initial);
  return {contains:value=>values.has(value),add:value=>values.add(value),remove:value=>values.delete(value),
    toggle(value,force){const on=force??!values.has(value);if(on)values.add(value);else values.delete(value);return on;}};
}
function zoomImage(body,{sheet=true,fit=false,viewport=350}={}){
  const listeners=new Map(),options=new Map();
  const wrap={clientWidth:viewport,scrollLeft:0,
    addEventListener(type,fn,opts){listeners.set(type,fn);options.set(type,opts);}};
  const img={parentElement:wrap,style:{width:""},classList:classes([...(sheet?["pv-sheet"]:[]),...(fit?["fit"]:[])]),
    setPointerCapture(id){this.captured=id;},
    addEventListener(type,fn){listeners.set(type,fn);},
    getBoundingClientRect(){
      const width=this.style.width?parseFloat(this.style.width):this.classList.contains("fit")?wrap.clientWidth:1150;
      return {left:20-wrap.scrollLeft,top:80-body.scrollTop,width,height:width*0.65};
    }};
  return {img,wrap,listeners,options,width:()=>img.getBoundingClientRect().width,
    fire(type,props={}){
      const e={clientX:120,clientY:180,cancelable:true,deltaY:0,deltaMode:0,touches:[],
        prevented:false,preventDefault(){this.prevented=true;},...props};
      listeners.get(type)(e);return e;
    }};
}
function harness(settings={}){
  const body={clientHeight:600,scrollTop:0};let now=1000;
  const context=vm.createContext({$:()=>body,Date:{now:()=>now}});
  vm.runInContext(helper+"globalThis.bind=bindPreviewZoom;",context);
  const h=zoomImage(body,settings);context.bind(h.img);
  return {...h,body,advance:ms=>{now+=ms;}};
}
const pair=(x1,x2,y=180)=>[{clientX:x1,clientY:y},{clientX:x2,clientY:y}];
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<0.000001,`${actual} != ${expected}`);

test("マウスホイールで拡大・縮小し、確認位置を保持する",()=>{
  const h=harness();const before=h.img.getBoundingClientRect();
  const x=(120-before.left)/before.width,y=(180-before.top)/before.width;
  assert.equal(h.fire("wheel",{deltaY:-100}).prevented,true);
  assert.ok(h.width()>1150);
  let rect=h.img.getBoundingClientRect();
  close(rect.left+x*rect.width,120);close(rect.top+y*rect.width,180);
  h.fire("wheel",{deltaY:100});close(h.width(),1150);
});

test("ホイールの行・ページ単位にも対応し、横スクロールは妨げない",()=>{
  for(const deltaMode of [0,1,2]){
    const h=harness();h.fire("wheel",{deltaY:-1,deltaMode});assert.ok(h.width()>1150);
  }
  const h=harness();
  assert.equal(h.fire("wheel",{deltaX:100}).prevented,false);
  assert.equal(h.fire("wheel",{deltaY:100,shiftKey:true}).prevented,false);
  assert.equal(h.fire("wheel",{deltaY:100,cancelable:false}).prevented,false);
  assert.equal(h.width(),1150);
  assert.equal(h.options.get("wheel").passive,false);
});

test("2本指の距離に応じて連続的に拡大・縮小する",()=>{
  const h=harness({fit:true});
  assert.equal(h.fire("touchstart",{touches:pair(70,170)}).prevented,true);
  assert.equal(h.fire("touchmove",{touches:pair(20,220)}).prevented,true);
  close(h.width(),700);
  h.fire("touchmove",{touches:pair(70,170)});close(h.width(),350);
  assert.equal(h.options.get("touchstart").passive,false);
  assert.equal(h.options.get("touchmove").passive,false);
});

test("ピンチ中に指の中心を動かしても同じ確認箇所を維持する",()=>{
  const h=harness({fit:true});const before=h.img.getBoundingClientRect();
  h.fire("touchstart",{touches:pair(70,170)});
  h.fire("touchmove",{touches:pair(40,240,200)});
  const after=h.img.getBoundingClientRect();
  close(after.left+(120-before.left)/before.width*after.width,140);
  close(after.top+(180-before.top)/before.width*after.width,200);
});

test("1本指のスクロールは妨げず、ピンチ後のクリックで倍率を戻さない",()=>{
  const h=harness({fit:true});
  assert.equal(h.fire("touchstart",{touches:pair(70,170).slice(0,1)}).prevented,false);
  assert.equal(h.fire("touchmove",{touches:pair(80,180).slice(0,1)}).prevented,false);
  h.fire("touchstart",{touches:pair(70,170)});
  h.fire("touchmove",{touches:pair(20,220)});
  h.fire("touchend");h.fire("click");close(h.width(),700);
  h.advance(501);h.fire("click");close(h.width(),350);
});

test("タップ・クリックの全体表示と拡大の切り替えを維持する",()=>{
  const h=harness();h.fire("click");close(h.width(),350);
  assert.equal(h.img.classList.contains("fit"),true);
  h.fire("click");close(h.width(),1150);
  assert.equal(h.img.classList.contains("fit"),false);
});

test("マウスドラッグで拡大画像を移動し、離した直後のクリックは無視する",()=>{
  const h=harness();h.body.scrollTop=150;h.wrap.scrollLeft=80;
  h.fire("pointerdown",{pointerType:"mouse",button:0,pointerId:1});
  assert.equal(h.img.captured,1);
  h.fire("pointermove",{pointerId:1,clientX:100,clientY:150});
  assert.equal(h.wrap.scrollLeft,100);assert.equal(h.body.scrollTop,180);
  assert.equal(h.img.style.cursor,"grabbing");
  h.fire("pointerup",{pointerId:1});h.fire("click");close(h.width(),1150);
  assert.equal(h.img.style.cursor,"");
  h.advance(501);h.fire("click");close(h.width(),350);
});

test("単純なマウスクリックは拡大切替を維持し、指のポインターは捕捉しない",()=>{
  const h=harness();
  h.fire("pointerdown",{pointerType:"touch",button:0,pointerId:2});
  assert.equal(h.img.captured,undefined);
  h.fire("pointerdown",{pointerType:"mouse",button:0,pointerId:1});
  h.fire("pointermove",{pointerId:1,clientX:121,clientY:180});
  h.fire("pointerup",{pointerId:1});h.fire("click");close(h.width(),350);
});

test("拡大・縮小の上限と下限を超えない",()=>{
  const h=harness();
  for(let i=0;i<50;i++)h.fire("wheel",{deltaY:-100});close(h.width(),4600);
  for(let i=0;i<100;i++)h.fire("wheel",{deltaY:100});close(h.width(),350);
  const wide=harness({viewport:1600});wide.fire("wheel",{deltaY:100});close(wide.width(),1150);
});

test("添付画像も拡大でき、全体表示は画面幅に追従する",()=>{
  const h=harness({sheet:false,fit:true});
  h.fire("wheel",{deltaY:-100});assert.ok(h.width()>350);
  h.fire("click");close(h.width(),350);assert.equal(h.img.style.width,"");
  h.wrap.clientWidth=500;close(h.width(),500);
  h.fire("click");assert.ok(h.width()>500);
});

test("キャンセル・重なった指・画像未表示でも不正な倍率を作らない",()=>{
  const h=harness({fit:true});
  h.fire("touchstart",{touches:pair(120,120)});
  h.fire("touchmove",{touches:pair(70,170)});close(h.width(),350);
  h.fire("touchcancel");
  h.fire("touchmove",{touches:pair(70,170)});close(h.width(),350);
  h.fire("touchmove",{touches:pair(20,220)});close(h.width(),700);
  h.wrap.clientWidth=0;h.fire("wheel",{deltaY:-100});close(h.width(),700);
});

test("再作成した複数ページと添付画像の全てに拡大操作を設定する",async()=>{
  const body={clientHeight:600,scrollTop:25,images:[],
    set innerHTML(value){this.markup=value;this.images=[...value.matchAll(/<img class="([^"]+)"/g)]
      .map(match=>zoomImage(this,{sheet:match[1].includes("pv-sheet"),fit:match[1].includes("fit")}));},
    querySelectorAll(){return this.images.map(h=>h.img);}};
  const preview={classList:classes()};const pages=[{},{}];
  const elements={pvBody:body,preview,printArea:{querySelectorAll:()=>pages}};
  let captures=0,builds=0;
  const html2canvas=async(_el,options)=>{assert.equal(options.scale,2);captures++;
    return {toDataURL:()=>"data:image/jpeg;base64,AA=="};};
  const context=vm.createContext({$:id=>elements[id]??{addEventListener(){}},window:{html2canvas},html2canvas,
    draftVersion:0,assertDraftVersion(){},
    buildPrintSheet:()=>builds++,showOverlay(){},hideOverlay(){},toast(){},console,
    esc:value=>value,attachments:[{dataUrl:"data:image/jpeg;base64,BB==",label:"領収書"}]});
  const end=script.indexOf("  /* ── 添付チェック",start);
  vm.runInContext(script.slice(start,end)+"globalThis.open=openPreview;",context);
  for(let round=0;round<2;round++){
    await context.open();assert.equal(body.images.length,3);
    assert.equal(preview.classList.contains("on"),true);assert.equal(body.scrollTop,0);
    for(const h of body.images){
      assert.ok(h.listeners.has("touchmove"));assert.ok(h.listeners.has("wheel"));
      const before=h.width();h.fire("wheel",{deltaY:-100});assert.ok(h.width()>before);
    }
  }
  assert.equal(builds,2);assert.equal(captures,4);
});
