/**
 * @fileOverview XMLHttpRequestを上書きし、擬似Webサーバを表現します。
 * @author akito moriki(benishouga@gmail.com)
 * @version 1.0.0.0
 */
(function() {
  /** @scope _global_  */
  
  var undefined;
  
  // HTTPステータスコードとその文字列のマップ
  var httpStatusTexts = {"100":"Continue","101":"Switching Protocols","102":"Processing","200":"OK","201":"Created","202":"Accepted","203":"Non-Authoritative Information","204":"No Content","205":"Reset Content","206":"Partial Content","207":"Multi-Status","226":"IM Used","300":"Multiple Choices","301":"Moved Permanently","302":"Found","303":"See Other","304":"Not Modified","305":"Use Proxy","306":"(Unused)","307":"Temporary Redirect","400":"Bad Request","401":"Unauthorized","402":"Payment Required","403":"Forbidden","404":"Not Found","405":"Method Not Allowed","406":"Not Acceptable","407":"Proxy Authentication Required","408":"Request Timeout","409":"Conflict","410":"Gone","411":"Length Required","412":"Precondition Failed","413":"Request Entity Too Large","414":"Request-URI Too Long","415":"Unsupported Media Type","416":"Requested Range Not Satisfiable","417":"Expectation Failed","418":"I'm a teapot","422":"Unprocessable Entity","423":"Locked","424":"Failed Dependency","425":"(Unordered Collection)","426":"Upgrade Required","500":"Internal Server Error","501":"Not Implemented","502":"Bad Gateway","503":"Service Unavailable","504":"Gateway Timeout","505":"HTTP Version Not Supported","506":"Variant Also Negotiates","507":"Insufficient Storage","510":"Not Extended"};
  
  // 通信状態
  var readyStates = {
    unsent  : 0, // open前
    opened  : 1, // openされました
    sent    : 2, // レスポンスヘッダ受信中
    loading : 3, // レスポンスヘッダ受信完了、レスポンスボディー受信中
    done    : 4  // すべてのデータの受信が完了
  };
  
  // xmlhttprequestオブジェクトのオリジナルを保存
  var _ActionXObject = window.ActiveXObject;
  var _XMLHttpRequest = window.XMLHttpRequest;
  
  // 擬似サーバ
  var serverMock = null;
  
  /**
   * クエリストリング文字列をオブジェクトにパースします。
   * @param {String} qs クエリストリング文字列
   * @private
   */
  var parse = function(qs){
    var map = {};
    if(!qs) return map;
    var pairs = qs.split("&");
    for(var i in pairs) {
      var pair = pairs[i].split("=");
      var key = decodeURIComponent(pair[0]);
      var val = decodeURIComponent(pair[1] || "");
      
      if(map[key] === undefined) {
        map[key] = val; // 存在しない場合、そのまま追加
      } else if(typeof(map[key]) === "string") {
        map[key] = [map[key], val]; // stringの場合、配列に詰めなおして追加
      } else {
        map[key].push(val); // Arrayの場合、そこに追加
      }
    }
    return map;
  };
  
  /**
   * childオブジェクトにparentオブジェクトのメンバを追加します。
   * @param {Object} child
   * @param {Object} parent
   * @type Object
   * @private
   */
  var extend = function(child, parent) {
    if(!(child && parent)) return child;
    var parents = [parent];
    for(var i = 2; i < arguments.length; i++) {
      parents.push(arguments[i]);
    }
    for(var index = 0; index < parents.length; index++) {
      var parent = parents[index];
      for(var key in parent) {
        child[key] = parent[key];
      }
    }
    return child;
  };
  
  /**
   * xmlドキュメントオブジェクトを生成します。
   * @param {String} str XMLドキュメントオブジェクトを生成する文字列
   * @type XMLDocument
   * @private
   */
  var createDom = function(str) {
    if(window.ActiveXObject) {
      var dom = new ActiveXObject("Microsoft.XMLDOM");
      dom.async = false;
      dom.loadXML(str);
      return dom;
    } else {
      var parser = new DOMParser();
      return parser.parseFromString(str, "text/xml");
    }
  };
  
  /**
   * サーバの擬似処理を行う際、リクエストの情報を保持するクラスです。 
   * @class サーバの擬似処理を行う際、リクエストの情報を保持するクラスです。
   * @param {XMLHttpRequestMock} xhr XMLHttpRequestMockオブジェクト
   * @param {String} data リクエストボディの文字列
   * @property {String} method openの際に指定した method
   * @property {Boolean} async openの際に指定した async
   * @property {String} user openの際に指定した user ※base64エンコードは行われていません。
   * @property {String} password openの際に指定した password ※base64エンコードは行われていません。
   * @property {Object} header リクエストヘッダの情報を保持するマップ
   * @property {Object} params リクエストで指定したQueryStringとリクエストボディ情報をマップに変換したもの<br />
   *   クエリストリングとリクエストボディで同じキーの値が設定されている場合、クエリストリングが優先されます。<br />
   *   同じキーの値が設定されていた場合、配列に格納し設定します。
   * @property {String} body リクエストボディの文字列
   * @property {Object} form リクエストボディの文字列をマップに変換したもの
   * @property {String} url openの際に指定した url のうち、クエリストリングを取り除いたもの
   * @property {String} querystring openの際に指定した url のうち、クエリストリングの部分だけを抽出したもの
   */
  var Request = function(xhr, data) {
    var form = parse(data),
      url = xhr.openInfo.url || "",
      index = url.indexOf("?"),
      querystring = index != -1 ? url.slice(index + 1) : "",
      queryparam = parse(querystring);
      url = index != -1 ? url.slice(0, index) : url;
    
    extend(this, xhr.openInfo, {
      header: extend({}, xhr.reqHeaders),
      params: extend({}, form, queryparam),
      body: data,
      form: form,
      url: url,
      querystring: querystring
    });
  };
  
  /**
   * サーバの擬似処理を行う際、レスポンスに関連する処理を管理するクラスです。
   * @class サーバの擬似処理を行う際、レスポンスに関連する処理を管理するクラスです。
   * @param {Function} callback サーバサイド処理が終わった際に呼び出すcallback処理
   * @property {String} header レスポンスヘッダを表現するマップ
   * @property {String} status 返却するhttpレスポンスステータスコード
   * @property {String} statusText 返却するhttpレスポンスステータステキスト<br />
   *   設定されなかった場合、ステータスコードから、妥当な文字列が選択されます。
   * @property {String} text 返却するレスポンスボディを指定します。<br />
   *   値がXMLの場合、解析されresponseXMLに設定されます。
   */
  var Response = function(callback) {
    this.header= {};
    this.callback = callback;
  };
  
  Response.prototype = {
    statusText: null,
    status: null,
    text: null,
    
    /**
     * 指定したコードで、レスポンスを返します。<br />
     * 指定がない場合、200(OK)をstatusコードとします。<br />
     * 指定がない場合の挙動以外は、fail()と同じ挙動です。
     * @param {Number} code statusコード
     */
    success: function(code) {
      this.status = code || 200;
      this.callback();
    },
    
    /**
     * 指定したコードで、レスポンスを返します。<br />
     * 指定がない場合、500(Internal Server Error)をstatusコードとします。<br />
     * 指定がない場合の挙動以外は、success()と同じ挙動です。
     * @param {Number} code statusコード
     */
    fail: function(code) {
      this.status = code || 500;
      this.callback();
    }
  };
  
  /**
   * 擬似管理クラスです。
   * @class 擬似処理の管理を行うクラスです。
   * @param {XMLHttpRequestMock} xhr XMLHttpRequestMockオブジェクト
   * @param {String} data POSTデータ
   * @private
   */
  var MockCore = function(xhr, data) {
    this.xhr = xhr;
    this.async = this.xhr.openInfo.async;
    this.data = data;
  };
  
  MockCore.prototype = {
    /**
     * サーバ間処理をシミュレートします。
     * @private
     */
    simulate: function() {
      var that = this;
      var xhr = this.xhr;
      
      var connect = function() {
        xhr.readyState = readyStates.sent;
        if(xhr.onreadystatechange) {
          xhr.onreadystatechange();
        }
        that.callServer();
      };
      
      if(this.async) {
        setTimeout(connect, 1);
      } else {
        connect();
      }
    },
    
    /**
     * サーバ処理を呼び出し、結果を返します。
     * @private
     */
    callServer: function() {
      var that = this;
      var request = new Request(this.xhr, this.data);
      var response = new Response(function() {
        if(that.async) that.returnResponse(response);
      });
      
      if(this.async) {
        setTimeout(function() {
          serverMock(request, response);
        }, 1);
      } else {
        serverMock(request, response);
        this.returnResponse(response);
      }
    },
    
    /**
     * クライアントにデータを返します。
     * @param {Response} response レスポンスオブジェクト
     * @private
     */
    returnResponse: function(response) {
      var xhr = this.xhr;
      
      // レスポンスヘッダ受信処理
      var receiveHeader = function() {
        if(xhr.aborted) return;
        
        extend(xhr.resHeaders, {
          "Date": new Date().toString(),
          "Content-Type": "text/plain"
        }, response.header);
        xhr.readyState = readyStates.loading;
        xhr.status = response.status || 200;
        xhr.statusText = response.statusText || httpStatusTexts[response.status] || "";
        if(xhr.onreadystatechange) {
          xhr.onreadystatechange();
        }
      };
      
      // レスポンスボディ受信処理
      var receiveBody = function() {
        if(xhr.aborted) return;
        
        xhr.readyState = readyStates.done;
        xhr.responseText = response.text || "";
        xhr.responseXML = createDom(xhr.responseText);
        if(xhr.onreadystatechange) {
          xhr.onreadystatechange();
        }
      };
      
      if(this.async) {
        setTimeout(function() {
          receiveHeader();
          setTimeout(receiveBody, 1); // 時間差でボディの受信後処理
        }, 1);
      } else {
        receiveHeader();
        receiveBody();
      }
    }
  };
  
  /**
   * XMLHttpRequestのMockクラスです。<br />
   * 通常のXMLHttpRequestと同一のメンバを保持しています。
   * @class XMLHttpRequestのMockクラスです。
   */
  var XMLHttpRequestMock = function() {
    // 独自メンバ
    this.openInfo   = {};
    this.reqHeaders = {};
    this.resHeaders = {};
    this.aborted = true;
    this.sent = false;
  };
  
  XMLHttpRequestMock.prototype = {
    
    // XMLHttpRequestのメンバ
    onreadystatechange: null,
    readyState: readyStates.unsent,
    status: 0,
    statusText: null,
    
    responseText: "",
    responseXML: null,
    
    /**
     * レスポンスヘッダの内容を全て取得します。
     * @type String
     */
    getAllResponseHeaders: function() {
      if(this.readyState < readyStates.loading) throw new Error("It's not received the response header yet. | レスポンスヘッダをまだ受信していません。")
      var r = [];
      for(var key in this.resHeaders) {
        r.push(key + ": " + this.resHeaders[key]);
      }
      return r.join("\n");
    },
    
    /**
     * 指定したキーのレスポンスヘッダの内容を取得します。
     * @param {String} key 取得するレスポンスヘッダのキー文字列
     * @type String
     */
    getResponseHeader: function(key) {
      if(this.readyState < readyStates.loading) throw new Error("It's not received the response header yet. | レスポンスヘッダをまだ受信していません。")
      
      return this.resHeaders[key];
    },
    
    /**
     * リクエストヘッダに文字列を設定します。
     * @param {String} key 値を設定するキー
     * @param {String} value 設定する値
     */
    setRequestHeader: function(key, value) {
      this.reqHeaders[key] = value;
    },
    
    /**
     * リクエストをキャンセルします。
     */
    abort: function() {
      this.aborted = true;
      this.sent = false;
      
      // 各パラメータを初期化
      this.openInfo   = {};
      this.reqHeaders = {};
      this.resHeaders = {};
      this.readyState = readyStates.unsent;
      this.status = 0;
      this.statusText = null;
      this.responseText = "";
      this.responseXML = null;
    },
    
    /**
     * リクエストをオープンします。
     * @param {String} method POSTやGET等のリクエストのメソッドを指定します。
     * @param {String} url アクセスを行うURLを指定します。
     * @param {Boolean} async 同期処理、非同期処理の指定を行います。
     * @param {String} user basic認証を行う際のユーザを指定します。
     * @param {String} password basic認証を行う際のパスワードを指定します。
     */
    open: function(method, url, async, user, password) {
      if(this.readyState >= readyStates.opened) throw new Error("Already opened. | 既にopen済みです。");
      if(!method) throw new Error("'method' is a illegal argument. | 引数が不正です。methodは必須です。");
      if(!url) throw new Error("'url' is a illegal argument. | 引数が不正です。urlは必須です。");
      
      this.readyState = readyStates.opened;
      
      this.openInfo.method = method;
      this.openInfo.url = url;
      async = async === undefined ? true : async;
      this.openInfo.async = async;
      this.openInfo.user = user;
      this.openInfo.password = password;
      
      this.aborted = false;
      
      if(this.onreadystatechange) {
        this.onreadystatechange();
      }
    },
    
    /**
     * リクエストを送信します。
     * @param {String} data POSTデータ
     */
    send: function(data) {
      if(this.readyState < readyStates.opened) throw new Error("This request is not opened yet. | このリクエストオブジェクトはまだopenされていません。");
      if(this.sent) throw new Error("This request was already sent. | このリクエストオブジェクトのデータは既に送信済みです。");
      this.sent = true;
      new MockCore(this, data).simulate();
    },
    /**
     * このオブジェクトの文字列表現を返します。
     * @type String
     */
    toString: function() {
      return "[object XMLHttpRequest]";
    }
  };
  
  /**
   * XMLHttpRequestを擬似のものに切り替え、擬似サーバの処理を設定する
   * @param {Function} mock 擬似サーバの処理
   * @memberOf _global_
   * @example
   *   // 擬似のサーバ処理を設定します。
   *   setServerMock(function(request, response) {
   *     alert(request.params.hoge); // alert "test"
   *     response.text = "response message";
   *     response.success();
   *   });
   *   
   *   // 通常どおりにXMLHttpRequestオブジェクトを生成し、sendすると、
   *   // 上で設定した、擬似サーバ処理が呼び出されます。
   *   var xhr = window.ActiveXObject ?
   *     new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
   *   xhr.open("GET", "http://hoge.hoge/?hoge=test");
   *   xhr.onreadystatechange = function() {
   *     if (xhr.readyState == 4 && xhr.status == 200) {
   *       alert("success");
   *     }
   *   };
   *   xhr.send(null);
   * @see Request
   * @see Response
   */
  window.setServerMock = function(mock) {
    if(typeof mock !== "function") throw new Error("'mock' is not a function. | 引数 mock にはfunctionオブジェクトを指定してください");
    
    if(_ActionXObject) {
      window.ActiveXObject = function(str) {
        if(!str.toUpperCase().match(/XMLHTTP/)) {
          // 通常のActiveXObjectを取得したい場合
          return new _ActionXObject(str);
        }
        return new XMLHttpRequestMock();
      };
    }
    if(_XMLHttpRequest) {
      window.XMLHttpRequest = XMLHttpRequestMock;
    }
    serverMock = mock;
  };
  
  /**
   * 通常のXMLHttpRequestを使えるようにします。
   * @memberOf _global_
   */
  window.removeServerMock = function() {
    window.ActiveXObject = _ActionXObject;
    window.XMLHttpRequest = _XMLHttpRequest;
    serverMock = null;
  };
  
})();



