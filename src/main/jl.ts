export const html = `<!DOCTYPE HTML>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=Edge,chrome=1">
    <title>热血精灵派</title>
    <link rel="Shortcut Icon" type="image/x-icon" href="//game-res.61.com/seer/index/images/favicon.ico?v=0929" />
    <style type="text/css">
        html, body {
            height: 100%;
            margin: 0 auto;
        }
    </style>
    <script src="static/fullscreen.js"></script>
</head>
<body id="flashContent">
<script src="static/swfobject.js"></script>
        <script type="text/javascript">
            var autoTimes = new Date();
            var flashUrl = "Client.swf?" + autoTimes.getTime();
            var so = new SWFObject(flashUrl, "Client", "1200", "660", "10", "#FFFFFF");
            so.addParam("menu", "false");
            so.addParam("wmode", "opaque");
            so.addParam("allowFullScreen", "true");
            so.addParam("allowScriptAccess", "always");
            so.addParam("allowFullScreenInteractive", "true");
            so.addParam("quality", "high");
            so.write("flashContent");
            // 在Flash加载完成后
            document.addEventListener('DOMContentLoaded', function() {
                window.fullscreenController = new FullscreenController({
                    containerId: 'flashContent',
                    targetId: 'Client',
                    originalWidth: 1200,
                    originalHeight: 660,
                    useNativeFullscreen: false,  // 页面内全屏，兼容性更好
                    defaultFullscreen: true,     // 🆕 游戏启动时自动全屏
                    showButton: false           // 🆕 隐藏按钮，沉浸式体验
                });
            });
        </script>

<div style="color: red;font-size: 20px;cursor: pointer;position: fixed;bottom: 20px;"
     onclick="event.target.parentNode.removeChild(event.target)">免费软件，咸鱼上的都是骗子，见到请举报
</div>
</body>
</html>`;

export const swfObject = `
/**
 * SWFObject v1.5: Flash Player detection and embed - http://blog.deconcept.com/swfobject/
 * 羈������IE11�弱�羞糸��鐚�莚桁�炊�炊��
 *
 * SWFObject is (c) 2007 Geoff Stearns and is released under the MIT License:
 * http://www.opensource.org/licenses/mit-license.php
 *
 */
if ("undefined" == typeof deconcept) var deconcept = {};
"undefined" == typeof deconcept.util && (deconcept.util = {});
"undefined" == typeof deconcept.SWFObjectUtil && (deconcept.SWFObjectUtil = {});
deconcept.SWFObject = function(a, b, c, d, e, f, g, h, k, l) {
  if (document.getElementById) {
    this.DETECT_KEY = l ? l : "detectflash";
    this.skipDetect = deconcept.util.getRequestParameter(this.DETECT_KEY);
    this.params = {};
    this.variables = {};
    this.attributes = [];

    if (a) {
      this.setAttribute("swf", a);
    }
    if (b) {
      this.setAttribute("id", b);
    }
    if (c) {
      this.setAttribute("width", c);
    }
    if (d) {
      this.setAttribute("height", d);
    }
    if (e) {
      this.setAttribute("version", new deconcept.PlayerVersion(e.toString().split(".")))
    }

    this.installedVer = deconcept.SWFObjectUtil.getPlayerVersion();

    if (!window.opera && document.all && 7 < this.installedVer.major ){
      deconcept.SWFObject.doPrepUnload = !0
    }

    if (f) {
      this.addParam("bgcolor", f)
    }
    this.addParam("quality", g ? g : "high");
    this.setAttribute("useExpressInstall", !1);
    this.setAttribute("doExpressInstall", !1);
    this.setAttribute("xiRedirectUrl", h ? h : window.location);
    this.setAttribute("redirectUrl", "");
    if (k) {
      this.setAttribute("redirectUrl", k)
    }
  }
    //document.getElementById && (this.DETECT_KEY = l ? l : "detectflash", this.skipDetect = deconcept.util.getRequestParameter(this.DETECT_KEY), this.params = {}, this.variables = {}, this.attributes = [], a && this.setAttribute("swf", a), b && this.setAttribute("id", b), c && this.setAttribute("width", c), d && this.setAttribute("height", d), e && this.setAttribute("version", new deconcept.PlayerVersion(e.toString().split("."))), this.installedVer = deconcept.SWFObjectUtil.getPlayerVersion(), !window.opera && document.all && 7 < this.installedVer.major && (deconcept.SWFObject.doPrepUnload = !0), f && this.addParam("bgcolor", f), this.addParam("quality", g ? g : "high"), this.setAttribute("useExpressInstall", !1), this.setAttribute("doExpressInstall", !1), this.setAttribute("xiRedirectUrl", h ? h : window.location), this.setAttribute("redirectUrl", ""), k && this.setAttribute("redirectUrl", k))
};
deconcept.SWFObject.prototype = {
    useExpressInstall: function(a) {
        this.xiSWFPath = a ? a : "expressinstall.swf";
        this.setAttribute("useExpressInstall", !0)
    },
    setAttribute: function(a, b) {
        this.attributes[a] = b
    },
    getAttribute: function(a) {
        return this.attributes[a]
    },
    addParam: function(a, b) {
        this.params[a] = b
    },
    getParams: function() {
        return this.params
    },
    addVariable: function(a, b) {
        this.variables[a] = b
    },
    getVariable: function(a) {
        return this.variables[a]
    },
    getVariables: function() {
        return this.variables
    },
    getVariablePairs: function() {
        var a = [],
            b, c = this.getVariables();
        for (b in c) a[a.length] = b + "=" + c[b];
        return a
    },
    getSWFHTML: function() {
        var a = "";
        if (deconcept.SWFObjectUtil.isIE11()) {
            this.getAttribute("doExpressInstall") && (this.addVariable("MMplayerType", "ActiveX"), this.setAttribute("swf", this.xiSWFPath));
            var a = '<object id="' + this.getAttribute("id") + '" type="application/x-shockwave-flash" width="' + this.getAttribute("width") + '" height="' + this.getAttribute("height") + '" style="' + this.getAttribute("style") + '">',
                a = a + ('<param name="movie" value="' + this.getAttribute("swf") + '" />'),
                b = this.getParams(),
                c;
            for (c in b) a += '<param name="' + c + '" value="' + b[c] + '" />';
            c = this.getVariablePairs().join("&");
            0 < c.length && (a += '<param name="flashvars" value="' + c + '" />');
            a += "</object>"
        } else if (navigator.plugins && navigator.mimeTypes && navigator.mimeTypes.length) {
            this.getAttribute("doExpressInstall") && (this.addVariable("MMplayerType", "PlugIn"), this.setAttribute("swf", this.xiSWFPath));
            a = '<embed type="application/x-shockwave-flash" src="' + this.getAttribute("swf") + '" width="' + this.getAttribute("width") + '" height="' + this.getAttribute("height") + '" style="' + this.getAttribute("style") + '"';
            a += ' id="' + this.getAttribute("id") + '" name="' + this.getAttribute("id") + '" ';
            b = this.getParams();
            for (c in b) a += [c] + '="' + b[c] + '" ';
            c = this.getVariablePairs().join("&");
            0 < c.length && (a += 'flashvars="' + c + '"');
            a += "/>"
        } else {
            this.getAttribute("doExpressInstall") && (this.addVariable("MMplayerType", "ActiveX"), this.setAttribute("swf", this.xiSWFPath));
            a = '<object id="' + this.getAttribute("id") + '" classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" width="' + this.getAttribute("width") + '" height="' + this.getAttribute("height") + '" style="' + this.getAttribute("style") + '">';
            a += '<param name="movie" value="' + this.getAttribute("swf") + '" />';
            b = this.getParams();
            for (c in b) a += '<param name="' + c + '" value="' + b[c] + '" />';
            c = this.getVariablePairs().join("&");
            0 < c.length && (a += '<param name="flashvars" value="' + c + '" />');
            a += "</object>"
        }
        return a
    },
    upgrade: function(a) {
      var b = this.getAttribute("micro") ? this.getAttribute("micro") : false;
      var c = b ? ("//webres.61.com/common/flash/upgrade_micro.html?m=" + b) : "static/flash-not-support.html";
      a = ("string" == typeof a ? document.getElementById(a) : a);
      a.innerHTML = '<iframe style="width:100%;height:100%" src="' + c + '"></iframe>';
    },
    checkUpgrade: function(a) {
      if (deconcept.SWFObjectUtil.getPlayerVersion().major > 0) {
        if (deconcept.SWFObjectUtil.getPlayerVersion().major === 32) {
          if (window.top !== window.self) {
            return false;
          } else {
            this.upgrade(a);
            return true;
          }
        } else {
          if (navigator.plugins && navigator.mimeTypes.length && !deconcept.SWFObjectUtil.isIE11()) {
            var b = navigator.plugins["Shockwave Flash"];
            var p1 = /.*\\.dll$/i;
            var p2 = /.*\\.plugin$/i;
            if (!p1.test(b.filename) && !p2.test(b.filename)) {
              this.upgrade(a);
              return true;
            }
          }
        }
      }
      return false;
    },
    write: function(a) {
      if (this.getAttribute("useExpressInstall")) {
        var b = new deconcept.PlayerVersion([6, 0, 65]);
        this.installedVer.versionIsValid(b) && !this.installedVer.versionIsValid(this.getAttribute("version")) && (this.setAttribute("doExpressInstall", !0), this.addVariable("MMredirectURL", encodeURIComponent(this.getAttribute("xiRedirectUrl"))), document.title = document.title.slice(0, 47) + " - Flash Player Installation", this.addVariable("MMdoctitle", document.title))
      }
      if (this.skipDetect || this.getAttribute("doExpressInstall") || this.installedVer.versionIsValid(this.getAttribute("version"))) {
        ("string" == typeof a ? document.getElementById(a) : a).innerHTML = this.getSWFHTML(), navigator.plugins && navigator.mimeTypes.length || (window[this.getAttribute("id")] = document.getElementById(this.getAttribute("id")));
        this.checkUpgrade(a);
        return !0;
      }
      "" != this.getAttribute("redirectUrl") && document.location.replace(this.getAttribute("redirectUrl"));
      this.checkUpgrade(a);
      return !1
    }
};
deconcept.SWFObjectUtil.getPlayerVersion = function() {
    var a = new deconcept.PlayerVersion([0, 0, 0]);
    if (navigator.plugins && navigator.mimeTypes.length && !deconcept.SWFObjectUtil.isIE11()) {
        var b = navigator.plugins["Shockwave Flash"];
        b && b.description && (a = new deconcept.PlayerVersion(b.description.replace(/([a-zA-Z]|\\s)+/, "").replace(/(\\s+r|\\s+b[0-9]+)/, ".").split(".")))
    } else if (navigator.userAgent && 0 <= navigator.userAgent.indexOf("Windows CE")) for (var b = 1, c = 3; b;) try {
        c++, b = new ActiveXObject("ShockwaveFlash.ShockwaveFlash." + c), a = new deconcept.PlayerVersion([c, 0, 0])
    } catch (d) {
        b = null
    } else {
        try {
            b = new ActiveXObject("ShockwaveFlash.ShockwaveFlash.7")
        } catch (d) {
            try {
                b = new ActiveXObject("ShockwaveFlash.ShockwaveFlash.6"), a = new deconcept.PlayerVersion([6, 0, 21]), b.AllowScriptAccess = "always"
            } catch (e) {
                if (6 == a.major) return a
            }
            try {
                b = new ActiveXObject("ShockwaveFlash.ShockwaveFlash")
            } catch (e) {}
        }
        null != b && (a = new deconcept.PlayerVersion(b.GetVariable("$version").split(" ")[1].split(",")))
    }
    return a
};
deconcept.PlayerVersion = function(a) {
    this.major = null != a[0] ? parseInt(a[0]) : 0;
    this.minor = null != a[1] ? parseInt(a[1]) : 0;
    this.rev = null != a[2] ? parseInt(a[2]) : 0
};
deconcept.PlayerVersion.prototype.versionIsValid = function(a) {
    return this.major < a.major ? !1 : this.major > a.major ? !0 : this.minor < a.minor ? !1 : this.minor > a.minor ? !0 : this.rev < a.rev ? !1 : !0
};
deconcept.util = {
    getRequestParameter: function(a) {
        var b = document.location.search || document.location.hash;
        if (null == a) return b;
        if (b) for (var b = b.substring(1).split("&"), c = 0; c < b.length; c++) if (b[c].substring(0, b[c].indexOf("=")) == a) return b[c].substring(b[c].indexOf("=") + 1);
        return ""
    }
};
deconcept.SWFObjectUtil.isIE11 = function() {
    return document.documentMode && !window.attachEvent
};
deconcept.SWFObjectUtil.cleanupSWFs = function() {
    for (var a = document.getElementsByTagName("OBJECT"), b = a.length - 1; 0 <= b; b--) {
        a[b].style.display = "none";
        for (var c in a[b])"function" == typeof a[b][c] && (a[b][c] = function() {})
    }
};
deconcept.SWFObject.doPrepUnload && !deconcept.unloadSet && (deconcept.SWFObjectUtil.prepUnload = function() {
    __flash_unloadHandler = function() {};
    __flash_savedUnloadHandler = function() {};
    window.attachEvent("onunload", deconcept.SWFObjectUtil.cleanupSWFs)
}, window.attachEvent("onbeforeunload", deconcept.SWFObjectUtil.prepUnload), deconcept.unloadSet = !0);
!document.getElementById && document.all && (document.getElementById = function(a) {
    return document.all[a]
});
window.getQueryParamValue = deconcept.util.getRequestParameter;
window.FlashObject = deconcept.SWFObject;
window.SWFObject = deconcept.SWFObject;`;

export const fullscreen = `
/**
 * 閫氱敤鍏ㄥ睆鍔熻兘缁勪欢
 * 鍙互灏嗕换鎰忓鍣ㄥ厓绱犺繘琛屽叏灞忔樉绀猴紝骞朵繚鎸佹寚瀹氱殑闀垮姣�
 */
class FullscreenController {
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.targetId = options.targetId;
    this.originalWidth = options.originalWidth;
    this.originalHeight = options.originalHeight;
    this.buttonPosition = options.buttonPosition || 'bottom-right';
    this.buttonIcon = options.buttonIcon || '鉀�';
    this.exitIcon = options.exitIcon || '鉀�';
    this.useNativeFullscreen = options.useNativeFullscreen !== false; // 榛樿浣跨敤鍘熺敓鍏ㄥ睆
    this.defaultFullscreen = options.defaultFullscreen || false; // 鏄惁榛樿鍏ㄥ睆
    this.showButton = options.showButton !== false; // 鏄惁鏄剧ず鎸夐挳锛岄粯璁ゆ樉绀�

    this.isFullscreen = false;
    this.isPageFullscreen = false; // 椤甸潰鍐呭叏灞忕姸鎬�
    this.scale = 1;
    this.button = null; // 鎸夐挳寮曠敤

    this.init();
  }

  /**
   * 鍒濆鍖栧叏灞忓姛鑳�
   */
  init() {
    this.injectStyles();
    this.createButton();
    this.bindEvents();
    
    // 濡傛灉璁剧疆浜嗛粯璁ゅ叏灞忥紝寤惰繜杩涘叆鍏ㄥ睆纭繚DOM瀹屽叏鍔犺浇
    if (this.defaultFullscreen) {
      setTimeout(() => {
        if (this.useNativeFullscreen) {
          this.enterFullscreen();
        } else {
          this.enterPageFullscreen();
        }
      }, 100);
    }
  }

  /**
   * 娉ㄥ叆CSS鏍峰紡
   */
  injectStyles() {
    const styleId = 'fullscreen-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
         style.textContent = \`
             /* 璁゜ody鎴愪负flex瀹瑰櫒锛屽眳涓樉绀哄唴瀹� */
             body {
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 min-height: 100vh;
                 margin: 0;
                 padding: 0;
             }
             
             /* 瀹瑰櫒姝ｅ父鐘舵€佹牱寮� */
             .fullscreen-container {
                 position: relative;
             }
             
             /* 鍏ㄥ睆鎸夐挳鏍峰紡 */
             .fullscreen-btn {
                 position: fixed;
                 width: 50px;
                 height: 50px;
                 background: rgba(0, 0, 0, 0.7);
                 color: white;
                 border: none;
                 border-radius: 8px;
                 cursor: pointer;
                 font-size: 18px;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 z-index: 9999;
                 transition: background 0.3s;
             }
             
             .fullscreen-btn:hover {
                 background: rgba(0, 0, 0, 0.9);
             }
             
             .fullscreen-btn.bottom-right {
                 bottom: 20px;
                 right: 20px;
             }
             
             .fullscreen-btn.bottom-left {
                 bottom: 20px;
                 left: 20px;
             }
             
             .fullscreen-btn.top-right {
                 top: 20px;
                 right: 20px;
             }
             
             .fullscreen-btn.top-left {
                 top: 20px;
                 left: 20px;
             }
             
             /* 鍘熺敓鍏ㄥ睆鐘舵€佷笅鐨勬牱寮� */
             body.fullscreen-active {
                 background: rgba(0, 0, 0, 0.95);
                 overflow: hidden;
             }
             
             body.fullscreen-active .fullscreen-container {
                 position: fixed;
                 top: 0;
                 left: 0;
                 width: 100vw !important;
                 height: 100vh !important;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 z-index: 1000;
                 overflow: visible;
             }
             
             /* 椤甸潰鍐呭叏灞忕姸鎬佷笅鐨勬牱寮� */
             body.page-fullscreen-active {
                 background: rgba(0, 0, 0, 0.95);
                 overflow: hidden;
             }
             
             body.page-fullscreen-active .fullscreen-container {
                 position: fixed;
                 top: 0;
                 left: 0;
                 width: 100vw !important;
                 height: 100vh !important;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 z-index: 1000;
                 overflow: visible;
             }
             
             /* 鐩爣鍏冪礌鍦ㄥ叏灞忔椂鐨勬牱寮� */
             body.fullscreen-active .fullscreen-target,
             body.page-fullscreen-active .fullscreen-target {
                 transform-origin: center center;
                 transition: transform 0.3s ease;
                 width: \${this.originalWidth}px !important;
                 height: \${this.originalHeight}px !important;
                 display: block;
                 flex-shrink: 0;
                 overflow: visible;
             }
         \`;
    document.head.appendChild(style);
  }

  /**
   * 鍒涘缓鍏ㄥ睆鎸夐挳
   */
  createButton() {
    // 濡傛灉璁剧疆浜嗕笉鏄剧ず鎸夐挳锛屾垨鑰呴粯璁ゅ叏灞忔椂锛屼笉鍒涘缓鎸夐挳
    if (!this.showButton || this.defaultFullscreen) {
      return;
    }

    const button = document.createElement('button');
    button.className = \`fullscreen-btn \${this.buttonPosition}\`;
    button.innerHTML = this.buttonIcon;
    button.title = '鍏ㄥ睆/閫€鍑哄叏灞�';
    button.onclick = () => this.toggleFullscreen();

    this.button = button;
    document.body.appendChild(button);
  }

  /**
   * 缁戝畾浜嬩欢鐩戝惉鍣�
   */
  bindEvents() {
    // 鐩戝惉鍏ㄥ睆鐘舵€佸彉鍖�
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.isFullscreen) {
        // 鐢ㄦ埛閫氳繃ESC閿垨鍏朵粬鏂瑰紡閫€鍑哄師鐢熷叏灞�
        this.exitFullscreen();
      }
    });

    // 鐩戝惉绐楀彛澶у皬鍙樺寲
    window.addEventListener('resize', () => {
      if (this.isFullscreen || this.isPageFullscreen) {
        this.adjustSize();
      }
    });

    // 鐩戝惉ESC閿�
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && (this.isFullscreen || this.isPageFullscreen)) {
        this.exitFullscreen();
      }
    });
  }

  /**
   * 鍒囨崲鍏ㄥ睆鐘舵€�
   */
  toggleFullscreen() {
    if (!this.isFullscreen && !this.isPageFullscreen) {
      if (this.useNativeFullscreen) {
        this.enterFullscreen();
      } else {
        this.enterPageFullscreen();
      }
    } else {
      this.exitFullscreen();
    }
  }

  /**
   * 杩涘叆鍏ㄥ睆
   */
  enterFullscreen() {
    const container = document.getElementById(this.containerId);
    const target = document.getElementById(this.targetId);

    if (!container || !target) {
      console.error('鏈壘鍒版寚瀹氱殑瀹瑰櫒鎴栫洰鏍囧厓绱�');
      return;
    }

    document.documentElement.requestFullscreen().then(() => {
      document.body.classList.add('fullscreen-active');
      container.classList.add('fullscreen-container');
      target.classList.add('fullscreen-target');

      this.isFullscreen = true;
      if (this.button) {
        this.button.innerHTML = this.exitIcon;
      }

      // 寤惰繜璋冩暣灏哄锛岀‘淇滵OM鏇存柊瀹屾垚
      setTimeout(() => this.adjustSize(), 50);
    }).catch(err => {
      console.error('杩涘叆鍏ㄥ睆澶辫触:', err);
      // 濡傛灉鍘熺敓鍏ㄥ睆澶辫触锛岄檷绾у埌椤甸潰鍐呭叏灞�
      this.enterPageFullscreen();
    });
  }

  /**
   * 杩涘叆椤甸潰鍐呭叏灞�
   */
  enterPageFullscreen() {
    const container = document.getElementById(this.containerId);
    const target = document.getElementById(this.targetId);

    if (!container || !target) {
      console.error('鏈壘鍒版寚瀹氱殑瀹瑰櫒鎴栫洰鏍囧厓绱�');
      return;
    }

    document.body.classList.add('page-fullscreen-active');
    container.classList.add('fullscreen-container');
    target.classList.add('fullscreen-target');

    this.isPageFullscreen = true;
    if (this.button) {
      this.button.innerHTML = this.exitIcon;
    }

    // 寤惰繜璋冩暣灏哄锛岀‘淇滵OM鏇存柊瀹屾垚
    setTimeout(() => this.adjustSize(), 50);
  }

  /**
   * 閫€鍑哄叏灞�
   */
  exitFullscreen() {
    const container = document.getElementById(this.containerId);
    const target = document.getElementById(this.targetId);

    // 濡傛灉鏄師鐢熷叏灞忥紝鍏堥€€鍑哄師鐢熷叏灞�
    if (document.fullscreenElement && this.isFullscreen) {
      document.exitFullscreen().catch(err => {
        console.error('閫€鍑哄叏灞忓け璐�:', err);
      });
    }

    // 娓呯悊鎵€鏈夊叏灞忕浉鍏崇殑绫�
    document.body.classList.remove('fullscreen-active');
    document.body.classList.remove('page-fullscreen-active');
    if (container) container.classList.remove('fullscreen-container');
    if (target) target.classList.remove('fullscreen-target');

    this.isFullscreen = false;
    this.isPageFullscreen = false;
    if (this.button) {
      this.button.innerHTML = this.buttonIcon;
    }
    this.resetSize();
  }

  /**
   * 璋冩暣鍏冪礌灏哄锛堝叏灞忔椂锛�
   */
  adjustSize() {
    const target = document.getElementById(this.targetId);
    const container = document.getElementById(this.containerId);
    if (!target || !container) return;

    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    // 璁＄畻缂╂斁姣斾緥锛岄€夋嫨杈冨皬鐨勬瘮渚嬩互纭繚瀹屽叏鏄剧ず
    const widthRatio = containerWidth / this.originalWidth;
    const heightRatio = containerHeight / this.originalHeight;
    this.scale = Math.min(widthRatio, heightRatio);

    // 璁＄畻缂╂斁鍚庣殑瀹為檯灏哄
    const scaledWidth = this.originalWidth * this.scale;
    const scaledHeight = this.originalHeight * this.scale;

    // 搴旂敤transform缂╂斁
    target.style.transform = 'scale(' + this.scale + ')';
    
    // 纭繚瀹瑰櫒鑳藉瀹屽叏瀹圭撼缂╂斁鍚庣殑鍐呭
    if (this.scale < 1) {
      // 褰撶缉鏀炬瘮渚嬪皬浜�1鏃讹紝璋冩暣鐩爣鍏冪礌鐨勬樉绀烘柟寮�
      target.style.position = 'relative';
      target.style.marginLeft = '0';
      target.style.marginTop = '0';
    } else {
      target.style.position = '';
      target.style.marginLeft = '';
      target.style.marginTop = '';
    }

    console.log('鍏ㄥ睆缂╂斁姣斾緥: ' + this.scale.toFixed(2) + 'x锛岀缉鏀惧悗灏哄: ' + scaledWidth.toFixed(0) + 'x' + scaledHeight.toFixed(0));
  }

  /**
   * 閲嶇疆鍏冪礌灏哄锛堥€€鍑哄叏灞忔椂锛�
   */
  resetSize() {
    const target = document.getElementById(this.targetId);
    if (target) {
      target.style.transform = '';
      target.style.position = '';
      target.style.marginLeft = '';
      target.style.marginTop = '';
    }
    this.scale = 1;
  }

  /**
   * 寮哄埗杩涘叆椤甸潰鍐呭叏灞忥紙涓嶄娇鐢ㄥ師鐢熷叏灞廇PI锛�
   */
  forcePageFullscreen() {
    if (!this.isFullscreen && !this.isPageFullscreen) {
      this.enterPageFullscreen();
    }
  }

  /**
   * 寮哄埗杩涘叆鍘熺敓鍏ㄥ睆
   */
  forceNativeFullscreen() {
    if (!this.isFullscreen && !this.isPageFullscreen) {
      this.enterFullscreen();
    }
  }

  /**
   * 鏄剧ず鍏ㄥ睆鎸夐挳
   */
  showFullscreenButton() {
    if (!this.button && this.showButton) {
      const button = document.createElement('button');
      button.className = \`fullscreen-btn \${this.buttonPosition}\`;
      button.innerHTML = this.isFullscreen || this.isPageFullscreen ? this.exitIcon : this.buttonIcon;
      button.title = '鍏ㄥ睆/閫€鍑哄叏灞�';
      button.onclick = () => this.toggleFullscreen();

      this.button = button;
      document.body.appendChild(button);
    }
  }

  /**
   * 闅愯棌鍏ㄥ睆鎸夐挳
   */
  hideFullscreenButton() {
    if (this.button && this.button.parentNode) {
      this.button.parentNode.removeChild(this.button);
      this.button = null;
    }
  }

  /**
   * 鑾峰彇褰撳墠鐘舵€�
   */
  getStatus() {
    return {
      isFullscreen: this.isFullscreen,
      isPageFullscreen: this.isPageFullscreen,
      scale: this.scale,
      useNativeFullscreen: this.useNativeFullscreen,
      defaultFullscreen: this.defaultFullscreen,
      showButton: this.showButton,
      hasButton: !!this.button
    };
  }

  /**
   * 閿€姣佸叏灞忔帶鍒跺櫒
   */
  destroy() {
    if (this.isFullscreen || this.isPageFullscreen) {
      this.exitFullscreen();
    }

    if (this.button && this.button.parentNode) {
      this.button.parentNode.removeChild(this.button);
    }

    // 绉婚櫎鏍峰紡
    const style = document.getElementById('fullscreen-styles');
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }

    // 绉婚櫎浜嬩欢鐩戝惉鍣�
    document.removeEventListener('fullscreenchange', this.bindEvents);
    window.removeEventListener('resize', this.bindEvents);
    document.removeEventListener('keydown', this.bindEvents);
  }
}

// 濡傛灉鍦∟ode.js鐜涓紝瀵煎嚭妯″潡
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FullscreenController;
}

// 濡傛灉鍦ㄦ祻瑙堝櫒鐜涓紝娣诲姞鍒板叏灞€瀵硅薄
if (typeof window !== 'undefined') {
  window.FullscreenController = FullscreenController;
}`;