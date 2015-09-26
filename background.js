// This event is fired each time the user updates the text in the omnibox,
// as long as the extension's keyword mode is still active.
var FF_MAX_SUGGESTIONS = 20;
var FF_MAX_MATCHLENGTH = 1000;
var FF_DEBUGGING = false;
var FF_HISTORY = [];

function ffGetHostname(url) {
  var a  = document.createElement('a');
  a.href = url;
  return a.hostname;
}

function ffSearchFor(text, callback) {
  text = text.trim();
  var words_exact = text.split(/\s+/).map(function(word) {
    return new RegExp(word, 'i');
  });

  var words_exact_hl = text.split(/\s+/).map(function(word) {
    return new RegExp("(" + word + ")", 'ig');
  });

  var words_fuzzy = text.split(/\s+/).map(function(word) {
    return new RegExp(text.split('').join('.*?'), 'i');
  });

  var highlightText = function(text) {
    words_exact_hl.forEach(function(word) {
      if(text.match(word)) {
        text = text.replace(word, "<match>$1</match>")
      }
    });
    return text;
  }

  var calculateScoreWords = function(tab) {
    var score = 0;
    var hostname = ffGetHostname(tab.url);

    words_fuzzy.forEach(function(word) {
      if(tab.title.match(word)) { score += 20; }
      if(tab.url.match(word)) { score += 20; }
      if(hostname.match(word)) { score += 20; }
    });

    words_exact.forEach(function(word) {
      if(tab.title.match(word)) { score += 100; }
      if(tab.url.match(word)) { score += 100; }
      if(hostname.match(word)) { score += 100; }
    });

    if(score > 0 && tab.pinned) { score += 1000; }

    if(FF_DEBUGGING && score > 0) { console.debug("tab", tab.title); }
    return score;
  }

  chrome.tabs.query({}, function(array_of_tabs) {
    callback(
        array_of_tabs.
        map(function(tab) { tab.score = calculateScoreWords(tab); return tab; }).
        filter(function(tab) { return tab.score >= 10; }).
        sort(function(tab1, tab2) {
          if(tab1.score < tab2.score) return 1;
          if(tab1.score > tab2.score) return -1;
          return 0;
        }).
        slice(0, FF_MAX_SUGGESTIONS).
        map(function(tab) {
          var content = JSON.stringify({tabId: tab.id, windowId: tab.windowId});
          tab.url = ffEscapeHtml(tab.url);
          tab.title = ffEscapeHtml(tab.title);
          var desc = highlightText(tab.title) + " <url>" +  highlightText(ffGetHostname(tab.url)) + "</url>";

          if(FF_DEBUGGING) {
            desc = "score:" + tab.score + " - " + desc;
          }

          if(tab.status !== "complete") {
            desc = "[" + tab.status + "] " + desc;
          }

          if(tab.incognito) {
            desc = "<url>[Incognito]</url> " + desc;
          }

          if(tab.pinned) {
            desc = "<url>[Pinned]</url> " + desc;
          }

          if(tab.audible) {
            desc = "<url>[Audible]</url> " + desc;
          }

          return {content: content, description: desc};
      })
    );
  });
}

chrome.omnibox.onInputChanged.addListener(
  function(text, suggest) {
    ffSearchFor(text, suggest);
  }
);

function ffEscapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

function ffActivateTag(tabId, windowId) {
  if(tabId) {
    chrome.tabs.update(tabId, {active: true});
  }
  if(windowId) {
    chrome.windows.update(windowId, {focused: true});
  }
}

chrome.omnibox.onInputEntered.addListener(
  function(text) {
    if(FF_DEBUGGING) {
      console.debug("entered:", text);
      console.debug("history:", FF_HISTORY);
    }

    var selected = {};

    if(text.length === 0) {
      if(FF_HISTORY.length >= 2) {
        selected = FF_HISTORY[FF_HISTORY.length - 2];
      } else {
        return;
      }
    } else {
      try {
        selected = JSON.parse(text);
      } catch(e) {
        // User probably typed something but selected the first default option,
        // i.e., "Run ff command: query"
        ffSearchFor(text, function(suggestions) {
          if(suggestions.length === 0) { return; }
          var selected = JSON.parse(suggestions[0].content);
          FF_HISTORY.push(selected);
          ffActivateTag(selected.tabId, selected.windowId)
        });
        return;
      }
    }

    FF_HISTORY.push(selected);
    ffActivateTag(selected.tabId, selected.windowId)
  }
);
