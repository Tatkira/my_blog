// Improved post view counter using CountAPI (https://countapi.xyz)
// Behavior:
// - Try `hit` (increments) and show returned value
// - If `hit` fails, try `get` to read current value
// - Shows '...' while loading and '-' on hard error
(function(){
  function sanitizeKey(s){
    if(!s) return 'home';
    return String(s).replace(/^\/+|\/+$/g, '').replace(/[^0-9A-Za-z_\-]/g, '_') || 'home';
  }

  var NAMESPACE = 'my_blog_visits';

  function getNum(key){
    try{
      var v = localStorage.getItem(key);
      var n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    } catch(e){
      return 0;
    }
  }

  function setNum(key, val){
    try{
      localStorage.setItem(key, String(val));
    } catch(e){
      // ignore storage errors
    }
  }

  function tryGet(sk){
    var url = 'https://api.countapi.xyz/get/' + encodeURIComponent(NAMESPACE) + '/' + encodeURIComponent(sk) + '?_=' + Date.now();
    return fetch(url, {method: 'GET', cache: 'no-store', mode: 'cors'}).then(function(res){ return res.json(); });
  }

  function tryHit(sk){
    var url = 'https://api.countapi.xyz/hit/' + encodeURIComponent(NAMESPACE) + '/' + encodeURIComponent(sk) + '?_=' + Date.now();
    return fetch(url, {method: 'GET', cache: 'no-store', mode: 'cors'}).then(function(res){ return res.json(); });
  }

  function updateAll(){
    var nodes = document.querySelectorAll('.post-views');
    if(!nodes || !nodes.length) return;
    nodes.forEach(function(node){
      var key = node.getAttribute('data-key') || node.getAttribute('data-path') || node.dataset.key || window.location.pathname;
      var sk = sanitizeKey(key);
      var counter = node.querySelector('.post-views-count');
      if(!counter) return;
      var localKey = 'post_views_local_' + sk;
      var remoteKey = 'post_views_remote_' + sk;
      var localDelta = getNum(localKey);
      var cachedRemote = getNum(remoteKey);
      var resolved = false;
      var timer = setTimeout(function(){
        if(resolved) return;
        localDelta += 1;
        setNum(localKey, localDelta);
        counter.textContent = String(cachedRemote + localDelta);
      }, 2000);
      counter.textContent = '...';

      tryHit(sk).then(function(data){
        resolved = true;
        clearTimeout(timer);
        if(data && typeof data.value !== 'undefined'){
          setNum(remoteKey, data.value);
          counter.textContent = String(data.value + localDelta);
        } else {
          // fallback to get
          return tryGet(sk).then(function(d){
            if(d && typeof d.value !== 'undefined'){
              setNum(remoteKey, d.value);
              counter.textContent = String(d.value + localDelta);
            } else {
              counter.textContent = String(cachedRemote + localDelta);
            }
          });
        }
      }).catch(function(err){
        resolved = true;
        clearTimeout(timer);
        console && console.warn && console.warn('post-views hit failed', err);
        // try reading without incrementing
        tryGet(sk).then(function(d){
          if(d && typeof d.value !== 'undefined'){
            setNum(remoteKey, d.value);
            counter.textContent = String(d.value + localDelta);
          } else {
            counter.textContent = String(cachedRemote + localDelta);
          }
        }).catch(function(err2){
          console && console.error && console.error('post-views get failed', err2);
          counter.textContent = String(cachedRemote + localDelta);
        });
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', updateAll);
  } else {
    // run after a short delay to avoid blocking other onload handlers
    setTimeout(updateAll, 10);
  }
})();
