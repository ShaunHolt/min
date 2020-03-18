var webviews = require('webviews.js')
var browserUI = require('browserUI.js')
var focusMode = require('focusMode.js')
var modalMode = require('modalMode.js')
var searchbar = require('searchbar/searchbar.js')
var urlParser = require('util/urlParser.js')

var progressBar = require('navbar/progressBar.js')
var bookmarkStar = require('navbar/bookmarkStar.js')
var permissionRequests = require('navbar/permissionRequests.js')

var lastTabDeletion = 0 // TODO get rid of this

window.tabBar = {
  container: document.getElementById('tabs'),
  tabElementMap: {}, // tabId: tab element
  editingTab: null, // the ID of the tab that is being edited
  getTab: function (tabId) {
    return tabBar.tabElementMap[tabId]
  },
  getTabInput: function (tabId) {
    return tabBar.getTab(tabId).querySelector('.tab-input')
  },
  setActiveTab: function (tabId) {
    var activeTab = document.querySelector('.tab-item.active')

    if (activeTab) {
      activeTab.classList.remove('active')
    }

    var el = tabBar.getTab(tabId)
    el.classList.add('active')

    requestIdleCallback(function () {
      requestAnimationFrame(function () {
        el.scrollIntoView()
      })
    }, {
      timeout: 1500
    })
  },
  enterEditMode: function (tabId, editingValue, showSearchbar) {
    // editingValue: an optional string to show in the searchbar instead of the current URL

    /* Edit mode is not available in modal mode. */
    if (modalMode.enabled()) {
      return
    }

    webviews.requestPlaceholder('editMode')

    var tabEl = tabBar.getTab(tabId)

    document.body.classList.add('is-edit-mode')
    tabEl.classList.add('selected')

    var currentURL = urlParser.getSourceURL(tabs.get(tabId).url)
    if (currentURL === 'min://newtab') {
      currentURL = ''
    }

    var input = tabBar.getTabInput(tabId)
    input.value = editingValue || currentURL
    input.focus()
    if (!editingValue) {
      input.select()
    }

    searchbar.show(input)

    if (showSearchbar !== false) {
      if (editingValue) {
        searchbar.showResults(editingValue, null)
      } else {
        searchbar.showResults('', null)
      }
    }

    tabBar.editingTab = tabId
  },
  leaveEditMode: function () {
    if (!tabBar.editingTab) {
      return
    }
    var selTab = document.querySelector('.tab-item.selected')
    if (selTab) {
      selTab.classList.remove('selected')
    }

    var input = document.querySelector('.tab-item .tab-input:focus')
    if (input) {
      input.blur()
    }

    document.body.classList.remove('is-edit-mode')
    searchbar.hide()

    webviews.hidePlaceholder('editMode')

    tabBar.editingTab = null
  },
  rerenderTab: function (tabId) {
    var tabData = tabs.get(tabId)

    var tabEl = tabBar.getTab(tabId)
    var viewContents = tabEl.querySelector('.tab-view-contents')

    var tabTitle = tabData.title || l('newTabLabel')
    var titleEl = viewContents.querySelector('.title')
    titleEl.textContent = tabTitle

    tabEl.title = tabTitle
    if (tabData.private) {
      tabEl.title += ' (' + l('privateTab') + ')'
    }

    viewContents.querySelectorAll('.permission-request-icon').forEach(el => el.remove())

    permissionRequests.getButtons(tabId).reverse().forEach(function (button) {
      viewContents.insertBefore(button, viewContents.children[0])
    })

    var secIcon = viewContents.getElementsByClassName('icon-tab-not-secure')[0]
    if (tabData.secure === false) {
      secIcon.hidden = false
    } else {
      secIcon.hidden = true
    }

    // update the star to reflect whether the page is bookmarked or not
    bookmarkStar.update(tabId, tabEl.querySelector('.bookmarks-button'))
  },
  rerenderAll: function () {
    empty(tabBar.container)
    tabBar.tabElementMap = {}

    tabs.get().forEach(function (tab) {
      var el = tabBar.createElement(tab)
      tabBar.container.appendChild(el)
      tabBar.tabElementMap[tab.id] = el
    })

    if (tabs.getSelected()) {
      tabBar.setActiveTab(tabs.getSelected())
    }
  },
  createElement: function (data) {
    var url = urlParser.parse(data.url)
    var tabTitle = data.title || l('newTabLabel')

    var tabEl = document.createElement('div')
    tabEl.className = 'tab-item'
    tabEl.setAttribute('data-tab', data.id)

    tabEl.title = tabTitle
    if (data.private) {
      tabEl.title += ' (' + l('privateTab') + ')'
    }

    var ec = document.createElement('div')
    ec.className = 'tab-edit-contents'

    var input = document.createElement('input')
    input.className = 'tab-input mousetrap'
    input.setAttribute('placeholder', l('searchbarPlaceholder'))
    input.value = url

    ec.appendChild(input)
    ec.appendChild(bookmarkStar.create(data.id))

    tabEl.appendChild(ec)

    var viewContents = document.createElement('div')
    viewContents.className = 'tab-view-contents'

    permissionRequests.getButtons(data.id).forEach(function (button) {
      viewContents.appendChild(button)
    })

    viewContents.appendChild(readerView.getButton(data.id))
    viewContents.appendChild(progressBar.create())

    // icons

    var iconArea = document.createElement('span')
    iconArea.className = 'tab-icon-area'

    var closeTabButton = document.createElement('i')
    closeTabButton.classList.add('tab-icon')
    closeTabButton.classList.add('tab-close-button')
    closeTabButton.classList.add('fa')
    closeTabButton.classList.add('fa-times-circle')

    closeTabButton.addEventListener('click', function (e) {
      browserUI.closeTab(data.id)
      // prevent the searchbar from being opened
      e.stopPropagation()
    })

    iconArea.appendChild(closeTabButton)

    if (data.private) {
      var pbIcon = document.createElement('i')
      pbIcon.className = 'fa fa-eye-slash icon-tab-is-private tab-icon tab-info-icon'
      iconArea.appendChild(pbIcon)
    }

    var secIcon = document.createElement('i')
    secIcon.className = 'fa fa-unlock icon-tab-not-secure tab-icon tab-info-icon'
    secIcon.title = l('connectionNotSecure')

    secIcon.hidden = data.secure !== false
    iconArea.appendChild(secIcon)

    viewContents.appendChild(iconArea)

    // title

    var title = document.createElement('span')
    title.className = 'title'
    title.textContent = tabTitle

    viewContents.appendChild(title)

    tabEl.appendChild(viewContents)

    input.addEventListener('keydown', function (e) {
      if (e.keyCode === 9 || e.keyCode === 40) { // if the tab or arrow down key was pressed
        searchbar.focusItem()
        e.preventDefault()
      }
    })

    // keypress doesn't fire on delete key - use keyup instead
    input.addEventListener('keyup', function (e) {
      if (e.keyCode === 8) {
        searchbar.showResults(this.value, e)
      }
    })

    input.addEventListener('keypress', function (e) {
      if (e.keyCode === 13) { // return key pressed; update the url
        if (this.getAttribute('data-autocomplete') && this.getAttribute('data-autocomplete').toLowerCase() === this.value.toLowerCase()) {
          // special case: if the typed input is capitalized differently from the actual URL that was autocompleted (but is otherwise the same), then we want to open the actual URL instead of what was typed.
          // see https://github.com/minbrowser/min/issues/314#issuecomment-276678613
          searchbar.openURL(this.getAttribute('data-autocomplete'), e)
        } else {
          searchbar.openURL(this.value, e)
        }
      } else if (e.keyCode === 9) {
        return
      // tab key, do nothing - in keydown listener
      } else if (e.keyCode === 16) {
        return
      // shift key, do nothing
      } else if (e.keyCode === 8) {
        return
      // delete key is handled in keyUp
      } else { // show the searchbar
        searchbar.showResults(this.value, e)
      }

      // on keydown, if the autocomplete result doesn't change, we move the selection instead of regenerating it to avoid race conditions with typing. Adapted from https://github.com/patrickburke/jquery.inlineComplete

      var v = e.key
      var sel = this.value.substring(this.selectionStart, this.selectionEnd).indexOf(v)

      if (v && sel === 0) {
        this.selectionStart += 1
        e.preventDefault()
      }
    })

    // prevent clicking in the input from re-entering edit-tab mode

    input.addEventListener('click', function (e) {
      e.stopPropagation()
    })

    // click to enter edit mode or switch to a tab
    viewContents.addEventListener('click', function (e) {
      if (tabs.getSelected() !== data.id) { // else switch to tab if it isn't focused
        browserUI.switchToTab(data.id)
      } else { // the tab is focused, edit tab instead
        tabBar.enterEditMode(data.id)
      }
    })

    tabEl.addEventListener('auxclick', function (e) {
      if (e.which === 2) { // if mouse middle click -> close tab
        browserUI.closeTab(data.id)
      }
    })

    tabEl.addEventListener('wheel', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        // https://github.com/minbrowser/min/issues/698
        return
      }
      if (e.deltaY > 65 && e.deltaX < 10 && Date.now() - lastTabDeletion > 650) { // swipe up to delete tabs
        lastTabDeletion = Date.now()

        /* tab deletion is disabled in focus mode */
        if (focusMode.enabled()) {
          focusMode.warn()
          return
        }

        var tab = this.getAttribute('data-tab')
        this.style.transform = 'translateY(-100%)'

        setTimeout(function () {
          browserUI.closeTab(tab)
        }, 150) // wait until the animation has completed
      }
    })

    return tabEl
  },
  addTab: function (tabId) {
    var tab = tabs.get(tabId)
    var index = tabs.getIndex(tabId)

    var tabEl = tabBar.createElement(tab)
    tabBar.container.insertBefore(tabEl, tabBar.container.childNodes[index])
    tabBar.tabElementMap[tabId] = tabEl
  },
  removeTab: function (tabId) {
    var tabEl = tabBar.getTab(tabId)
    if (tabEl) {
      // The tab does not have a coresponding .tab-item element.
      // This happens when destroying tabs from other task where this .tab-item is not present
      tabBar.container.removeChild(tabEl)
      delete tabBar.tabElementMap[tabId]
    }
  }
}

// when we click outside the navbar, we leave editing mode

document.getElementById('webviews').addEventListener('click', function () {
  tabBar.leaveEditMode()
})

/* progress bar events */

webviews.bindEvent('did-start-loading', function (webview, tabId, e) {
  progressBar.update(tabBar.getTab(tabId).querySelector('.progress-bar'), 'start')
})

webviews.bindEvent('did-stop-loading', function (webview, tabId, e) {
  progressBar.update(tabBar.getTab(tabId).querySelector('.progress-bar'), 'finish')
})

tasks.on('tab-updated', function (id, key) {
  if (key === 'title' || key === 'secure' || key === 'url') {
    tabBar.rerenderTab(id)
  }
})

permissionRequests.onChange(function (tabId) {
  tabBar.rerenderTab(tabId)
})
