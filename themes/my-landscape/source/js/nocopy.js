/* 简洁版本：允许选中但阻止复制（copy/cut 事件和键盘快捷键），不拦截右键菜单 */
var NO_COPY_MSG = '内容受版权保护，禁止复制；如需转载请联系作者。';

(function(){
  function isInCode(node){
    while(node){
      if(node.nodeType===1){
        var tag = node.tagName.toLowerCase();
        if(tag === 'code' || tag === 'pre') return true;
        if(node.classList && (node.classList.contains('highlight') || node.classList.contains('gist') || node.classList.contains('line'))) return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function selectionContainerIsCode(){
    try{
      var sel = window.getSelection();
      if(!sel || sel.isCollapsed) return false;
      var range = sel.getRangeAt(0);
      var container = range.commonAncestorContainer;
      if(container.nodeType !== 1) container = container.parentNode;
      return isInCode(container);
    }catch(e){ return false; }
  }

  function handleCopyCut(e){
    if(selectionContainerIsCode()) return; // 代码块允许复制
    try{
      if(e.clipboardData && e.clipboardData.setData){
        e.clipboardData.setData('text/plain', NO_COPY_MSG);
        e.preventDefault();
        return;
      }
      if(window.clipboardData && window.clipboardData.setData){
        window.clipboardData.setData('Text', NO_COPY_MSG);
        e.preventDefault();
        return;
      }
      e.preventDefault();
    }catch(err){
      try{ e.preventDefault(); }catch(e2){}
    }
  }

  document.addEventListener('copy', handleCopyCut);
  document.addEventListener('cut', handleCopyCut);

  // 阻止键盘复制/剪切快捷键（Ctrl/Cmd+C/Ctrl/Cmd+X）在非代码区的行为
  document.addEventListener('keydown', function(e){
    var key = e.key || '';
    var code = e.keyCode || 0;
    var isCopy = (e.ctrlKey || e.metaKey) && (key === 'c' || key === 'C' || code === 67);
    var isCut = (e.ctrlKey || e.metaKey) && (key === 'x' || key === 'X' || code === 88);
    if((isCopy || isCut) && !selectionContainerIsCode()){
      try{ e.preventDefault(); }catch(err){}
    }
  });
})();
