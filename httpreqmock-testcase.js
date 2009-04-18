/** テストケース */

$(function(){
  module("httpreqmock.js");
  
  window.exception = function(test, message) {
    try{
      test();
      ok(false, message);
    } catch(e) {
      ok(true, message);
    }
  };
  
  test("setServerMock & removeServerMock", function() {
    // このテストは元の状態を確かめるため、一番最初にテストする必要あり
    
    expect(3);
    var before = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    setServerMock(function(req, res) {});
    var mock = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    removeServerMock();
    var after = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    
    ok(!before.openInfo, "通常のXMLHttpRequestはopenInfoプロパティを持たない");
    ok(mock.openInfo, "mockはopenInfoプロパティを持つ");
    ok(!after.openInfo, "removeした後XMLHttpRequestは通常のもののためopenInfoプロパティを持たない");
  });
  
  test("XMLHttpRequestを使った基本的なajax呼び出し(GET)", function() {
    expect(8);
    stop();
    
    setServerMock(function(req, res) {
      ok(true, "擬似サーバ処理");
      equals(req.url, "http://hoge.hoge/");
      equals(req.method, "GET");
      equals(req.params.foo, "100");
      equals(req.params.bar, "huga");
      
      res.text = "レスポンス文字列";
      res.success();
    });
    
    var xhr = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    
    xhr.open("GET", "http://hoge.hoge/?foo=100&bar=huga");
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4 && xhr.status == 200) {
        ok(true, "成功時処理");
        equals(xhr.statusText, "OK");
        equals(xhr.responseText, "レスポンス文字列");
        start();
      }
    };
    xhr.send(null);
  });
  
  test("XMLHttpRequestを使った基本的なajax呼び出し (POST)", function() {
    expect(8);
    stop();
    
    setServerMock(function(req, res) {
      ok(true, "擬似サーバ処理");
      equals(req.url, "http://hoge.hoge/");
      equals(req.method, "POST");
      equals(req.params.foo, "100");
      equals(req.params.bar, "huga");
      
      res.text = "レスポンス文字列";
      res.success();
    });
    
    var xhr = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    
    xhr.open("POST", "http://hoge.hoge/");
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4 && xhr.status == 200) {
        ok(true, "成功時処理");
        equals(xhr.statusText, "OK");
        equals(xhr.responseText, "レスポンス文字列");
        start();
      }
    };
    xhr.send("foo=100&bar=huga");
  });
  
  test("リクエストの内容の検証", function() {
    expect(16);
    stop();
    
    setServerMock(function(req, res) {
      ok(true, "擬似サーバ処理");
      equals(req.url, "http://hoge.hoge/");
      equals(req.method, "POST");
      equals(req.body, "hoge=rarara&huga=oh");
      equals(req.async, true);
      same(req.form, {hoge: "rarara", huga:"oh"});
      same(req.header, {ReqHeaderKey: "ReqHeaderValue"});
      equals(req.user, "testUser");
      equals(req.password, "testPassword");
      equals(req.querystring, "foo=abc&foo=def");
      equals(req.params.foo.length, 2);
      equals(req.params.foo[0], "abc");
      equals(req.params.foo[1], "def");
      equals(req.params.hoge, "rarara");
      equals(req.params.huga, "oh");
      res.success();
    });
    
    var xhr = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    xhr.setRequestHeader("ReqHeaderKey", "ReqHeaderValue");
    
    xhr.open("POST", "http://hoge.hoge/?foo=abc&foo=def", true, "testUser", "testPassword");
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4 && xhr.status == 200) {
        ok(true, "成功時処理");
        start();
      }
    };
    xhr.send("hoge=rarara&huga=oh");
  });
  
  test("XMLHttpRequestをabortする場合", function() {
    expect(1);
    stop();
    
    setServerMock(function(req, res) {
      res.success();
      ok(true, "サーバの処理は完了");
    });
    
    var xhr = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    
    xhr.open("GET", "hoge");
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4 && xhr.status == 200) {
        ok(false, "callbackはキャンセルされているはず");
        start();
      }
    };
    xhr.send(null);
    xhr.abort(); // 即キャンセル
    
    setTimeout(function(){
      start();
    }, 100);
  });
  
  test("onreadystatechangeのシミュレートができてるか確認", function() {
    expect(32);
    stop();
    
    setServerMock(function(req, res) {
      ok(true, "擬似サーバ処理");
      res.text = '<?xml version="1.0" encoding="UTF-8"?><result>リザルトメッセージ</result>';
      res.success();
    });
    
    var xhr = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    
    equals(xhr.status, 0);
    equals(xhr.statusText, null);
    equals(xhr.readyState, 0);
    equals(xhr.responseXML, null);
    exception(function(){xhr.getAllResponseHeaders()}, "xhr.getAllResponseHeaders() は、例外");
    exception(function(){xhr.getResponseHeader('Content-Type')}, "xhr.getResponseHeader('Content-Type') は、例外");
    
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        equals(xhr.status, 200);
        equals(xhr.statusText, "OK");
        equals(xhr.responseText, '<?xml version="1.0" encoding="UTF-8"?><result>リザルトメッセージ</result>');
        var xmlResults = xhr.responseXML.getElementsByTagName("result");
        ok(xmlResults.length, "XMLデータあり");
        ok(xmlResults[0], "リザルトメッセージ");
        ok(xhr.getAllResponseHeaders(), "取得可能");
        ok(xhr.getResponseHeader('Content-Type'), "取得可能");
        start();
      }
      if (xhr.readyState === 3) {
        equals(xhr.status, 200);
        equals(xhr.statusText, "OK");
        equals(xhr.responseText, "");
        equals(xhr.responseXML, null);
        ok(xhr.getAllResponseHeaders(), "取得可能");
        ok(xhr.getResponseHeader('Content-Type'), "取得可能");
      }
      if (xhr.readyState === 2) {
        equals(xhr.status, 0);
        equals(xhr.statusText, null);
        equals(xhr.responseText, "");
        equals(xhr.responseXML, null);
        exception(function(){xhr.getAllResponseHeaders()}, "xhr.getAllResponseHeaders() は、例外");
        exception(function(){xhr.getResponseHeader('Content-Type')}, "xhr.getResponseHeader('Content-Type') は、例外");
      }
      if (xhr.readyState === 1) {
        equals(xhr.status, 0);
        equals(xhr.statusText, null);
        equals(xhr.responseText, "");
        equals(xhr.responseXML, null);
        exception(function(){xhr.getAllResponseHeaders()}, "xhr.getAllResponseHeaders() は、例外");
        exception(function(){xhr.getResponseHeader('Content-Type')}, "xhr.getResponseHeader('Content-Type') は、例外");
      }
    };
    
    xhr.open("GET", "http://hoge.hoge/");
    xhr.send(null);
  });
  
  test("処理順のチェック async=true", function() {
    stop();
    var result = "";
    setTimeout(function() {
      equals(result, "123456789");
      start();
    }, 100);
    
    setServerMock(function(req, res) {
      res.success();
    });
    
    result += "1";
    var xhr = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    result += "2";
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 1) {
        result += "4";
      }
      if (xhr.readyState == 2) {
        result += "7";
      }
      if (xhr.readyState == 3) {
        result += "8";
      }
      if (xhr.readyState == 4) {
        result += "9";
      }
    };
    
    result += "3";
    xhr.open("POST", "http://hoge.hoge/", true);
    result += "5";
    xhr.send(null);
    result += "6";
  });
  
  test("処理順のチェック async=false", function() {
    stop();
    var result = "";
    setTimeout(function() {
      equals(result, "123456789");
      start();
    }, 100);
    
    setServerMock(function(req, res) {
      res.success();
    });
    
    result += "1";
    var xhr = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    result += "2";
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 1) {
        result += "4";
      }
      if (xhr.readyState == 2) {
        result += "6";
      }
      if (xhr.readyState == 3) {
        result += "7";
      }
      if (xhr.readyState == 4) {
        result += "8";
      }
    };
    
    result += "3";
    xhr.open("POST", "http://hoge.hoge/", false);
    result += "5";
    xhr.send(null);
    result += "9";
  });
  
  test("メソッドの2度呼び出し時の例外", function() {
    expect(2);
    stop();
    setServerMock(function() {
      start();
    });
    var xhr1 = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    xhr1.open("GET", "http://hoge.hoge/");
    exception(function() { xhr1.open("GET", "http://hoge.hoge/") }, "open() 2度目は例外");
    
    var xhr2 = window.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
    xhr2.open("GET", "http://hoge.hoge/");
    xhr2.send(null);
    exception(function() { xhr2.send(null) }, "send() 2度目は例外");
  });
  
  test("jQuery#ajaxを使った基本的なajax呼び出し", function() {
    expect(4);
    stop();
    
    var reqUrl = "/test";
    var data = {
      time: "100",
      jp: "日本語とかどうなんだろうね！",
      symbol: "!\"#$%&'()=~|P{`+*}>?_<ﾊﾝｶｸとか"
    };
    
    setServerMock(function(req, res) {
      ok(true, "擬似サーバ処理");
      same(req.params, data);
      equals(req.url, reqUrl);
      res.success();
    });
    
    $.ajax({
      url: reqUrl,
      data: data,
      success : function(data, status) {
        ok(true, "成功時処理");
        start();
      }
    });
  });
  
  
  // with jquery and qunit
  test("sample test", function() {
    expect(2);
    
    // Set the server processing.
    setServerMock(function(request, response) {
      // Delayed server
      setTimeout(function() {
        ok(true, "server processing...")
        
        // Set any text of the response.
        response.text = "response text...";
        
        // Return response with success(200 OK).
        response.success();
      }, request.params.time);
    });
    
    
    // The set server processing is called.
    $.ajax({
      url: "/sample/service?time=100",
      success: function(response) {
        equals(response, "response text...");
        start();
      }
    });
    
    stop();
  });
  
});



