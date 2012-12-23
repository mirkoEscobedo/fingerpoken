// Generated by CoffeeScript 1.4.0
(function() {
  var Controller, Finger, angle, copyTouch, distance,
    _this = this;

  window.onerror = function(message, url, line) {
    window.$logger || (window.$logger = new WSLogger("ws://10.0.0.3:8081/"));
    return window.$logger.log({
      message: message,
      url: url,
      line: line
    });
  };

  distance = function(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2.0) + Math.pow(y1 - y2, 2.0));
  };

  angle = function(x1, y1, x2, y2) {
    return Math.atan((y1 - y2) / (x1 - x2));
  };

  copyTouch = function(touch) {
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      identifier: touch.identifier,
      pageX: touch.pageX,
      pageY: touch.pageY,
      screenX: touch.screenX,
      screenY: touch.screenY,
      target: touch.target
    };
  };

  Finger = (function() {

    function Finger(touch) {
      this.callbacks = {};
      this.origin = this.touch = copyTouch(touch);
      this.travel = 0;
    }

    Finger.prototype.trigger = function(name, t) {
      var callback, _i, _len, _ref, _results;
      if (this.callbacks[name]) {
        _ref = this.callbacks[name];
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          callback = _ref[_i];
          _results.push(callback(this, t));
        }
        return _results;
      }
    };

    Finger.prototype.move = function(t) {
      t.distance = distance(t.pageX, t.pageY, this.touch.pageX, this.touch.pageY);
      t.angle = angle(t.pageX, t.pageY, this.touch.pageX, this.touch.pageY);
      this.travel += t.distance;
      t.travel = this.travel;
      this.touch = copyTouch(t);
      return this.trigger("move", t);
    };

    Finger.prototype.down = function(t) {
      this.touch = t;
      return this.trigger("down", t);
    };

    Finger.prototype.up = function(t) {
      this.trigger("up", t || this.touch);
      return delete this.touch;
    };

    Finger.prototype.bind = function(event, callback) {
      var _base;
      (_base = this.callbacks)[event] || (_base[event] = []);
      return this.callbacks[event].push(callback);
    };

    Finger.prototype.origin_distance = function() {
      return distance(this.origin.pageX, this.origin.pageY, this.touch.pageX, this.touch.pageY);
    };

    Finger.prototype.origin_angle = function() {
      return angle(this.origin.pageX, this.origin.pageY, this.touch.pageX, this.touch.pageY);
    };

    return Finger;

  })();

  Controller = (function() {

    function Controller(element) {
      var _this = this;
      this.element = element;
      this.logger = new WSLogger("ws://10.0.0.3:8081/");
      this.fingers = {};
      $("#controller").bind("touchmove", false);
      this.canvas = d3.select(this.element).append("svg").node();
      d3.select(this.canvas).attr("id", "canvasthing").on("touchstart", function() {
        return _this.touchstart();
      }).on("touchend", function() {
        return _this.touchend();
      }).on("touchmove", function() {
        return _this.touchmove();
      });
      this.log("ready");
    }

    Controller.prototype.touchstart = function() {
      var finger, touch, _i, _len, _ref, _results;
      d3.event.preventDefault();
      _ref = d3.event.changedTouches;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        touch = _ref[_i];
        finger = this.fingers[touch.identifier] = new Finger(touch);
        _results.push(this.circle_cursor(finger));
      }
      return _results;
    };

    Controller.prototype.touchmove = function() {
      var touch, _i, _len, _ref, _results;
      d3.event.preventDefault();
      _ref = d3.event.changedTouches;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        touch = _ref[_i];
        _results.push(this.fingers[touch.identifier].move(touch));
      }
      return _results;
    };

    Controller.prototype.touchend = function() {
      var touch, _i, _len, _ref, _results;
      d3.event.preventDefault();
      _ref = d3.event.changedTouches;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        touch = _ref[_i];
        this.fingers[touch.identifier].up(touch);
        _results.push(delete this.fingers[touch.identifier]);
      }
      return _results;
    };

    Controller.prototype.log = function(obj) {
      return this.logger.log(obj);
    };

    Controller.prototype.circle_cursor = function(finger) {
      var circle, color,
        _this = this;
      this.palette || (this.palette = d3.scale.category10());
      this.palette_i || (this.palette_i = 0);
      this.palette_i++;
      color = this.palette(this.palette_i);
      circle = d3.select(this.canvas).append("circle");
      circle.attr("r", 50).attr("cx", finger.touch.pageX).attr("cy", finger.touch.pageY).attr("stroke", "#000").attr("fill", color);
      finger.bind("move", function(finger, touch) {
        _this.log({
          distance: finger.origin_distance(touch),
          angle: finger.origin_angle(touch),
          travel: finger.travel
        });
        circle.attr("cx", touch.pageX).attr("cy", touch.pageY);
        return d3.select(_this.canvas).append("circle").attr("r", "30").attr("cx", finger.touch.pageX).attr("cy", finger.touch.pageY).attr("fill", color).transition().duration(500).attr("r", "0").remove();
      });
      return finger.bind("up", function(finger, touch) {
        circle.style("opacity", 1);
        return circle.transition().duration(500).style("opacity", 0).attr("r", circle.attr("r") * 0.50).remove();
      });
    };

    return Controller;

  })();

  window.addEventListener("load", function() {
    return new Controller(document.querySelector("#controller"));
  });

}).call(this);
