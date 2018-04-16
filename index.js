'use strict';

function noop() {}

function bind(fn, thisArg) {
  return function() {
    fn.apply(thisArg, arguments);
  };
}

function Promise(fn) {
  this.state = 0;
  this.flag = false;
  this.value = undefined;
  this.list = [];//list的作用就是为了当在一个promise中
  excute(fn, this);
}
/**
 * handlehandle(promise, map)的作用:
 * 注意:map.promise就是调用then要返回的新的Promise,所以下面用thenPromise代替
 * 当promise.state === 0 执行 promise.list.push(map); promise.flag 还是 false
 * 当promise.state === 1 当then(a,b)中的a为null的时候   在异步队列中执行  thenPromise.value = promise.value
 *                       当then(a,b)中的a为函数的时候   在异步队列中执行  resolve(thenPromise,a(promise.value))
 * 当promise.state === 2 当then(a,b)中的b为null的时候   在异步队列中执行  thenPromise.value = promise.value
 *                       当then(a,b)中的b为函数的时候   在异步队列中执行  resolve(thenPromise,b(promise.value))
 * 当promise.state === 3 执行 promise = promise.value
 */

function handle(promise, map) {
  //promise.state === 3的时候promise.value就是一个Promise
  while (promise.state === 3) {
    promise = promise.value;
  }
  //pending
  if (promise.state === 0) {
    promise.list.push(map);
    return;
  }
  promise.flag = true;
  //resolved或者rejected
  setTimeout(function() {
    var cb = promise.state === 1 ? map.onFulfilled : map.onRejected;
    if (cb === null) {
      /**
       * map.promise = {
       *   state: *
       *   value: promise.value
       *   ...
       * }
       */
      (promise.state === 1 ? resolve : reject)(map.promise, promise.value);
      return;
    }
    var ret;
    try {
      ret = cb(promise.value);
    } catch (e) {
      /**
       * map.promise = {
       *   state: *
       *   value: e
       *   ...
       * }
       */
      reject(map.promise, e);
      return;
    }
    /**
     * 当ret为Promise
     * map.promise = {
     *   state: 3
     *   value: ret
     *   ...
     * }
     * 当ret中then方法，继续递归
     * 当ret为非Promise且没有then方法
     * map.promise = {
     *   state: 1
     *   value: ret
     *   ...
     * }
     */
    resolve(map.promise, ret);
  },0);
}
/**********************************************************************************************************************************************************************************************
excute(fn,promise)-----通过fn中的resolve、reject修改promise的state、value等等
resolve(val)-----将promise的state修改为1，value修改为val



                    ┌───────参数是thenable,excute(val.then,promise)───────┐                                                   ┌─────────────────────────────────────────────┐
                    ↓                                                    │                                                   │                                             │
promise───────────>excute(fn,promise)──────fn中存在resolve(val)──────────>resolve(promise,val)────────val是一个Promise───────>finale(promise)─────0<promise.list.length────>handle
 ↑                  │                                                    │                                                   │                                             │
 └──────────────────┘

 **********************************************************************************************************************************************************************************************/

function excute(fn, promise) {
  var done = false;
  try {
    fn(
      function(value) {
        if (done){ return; } done = true;
        resolve(promise, value);
      },
      function(error) {
        if (done){ return; } done = true;
        reject(promise, error);
      }
    );
  } catch (error) {
    if (done){ return; } done = true;
    reject(promise, error);
  }
}
/**
 * resolve(promise,val)
 * 如果val是一个Promise，则promise{state:3,value:val}
 * 如果val简单类型的变量，或者是个没有then方法的非Promise的Object的时候，则promise{state:1,value:val}
 * 如果val是一个有then属性的Object的时候，则promise{}
 */
function resolve(promise, val) {
  try {
    if (typeof val === 'object') {
      var then = val.then;
      if (val instanceof Promise) {
        promise.state = 3;
        promise.value = val;
        finale(promise);
        return;
      } else if (typeof then === 'function') {
        //excute(then.bind(val),promise)
        excute(bind(then, val), promise);//修改的还是原来的promise
        return;
      }
    }
    promise.state = 1;
    promise.value = val;
    finale(promise);
  } catch (e) {
    reject(promise, e);
  }
}

function reject(promise, val) {
  promise.state = 2;
  promise.value = val;
  finale(promise);
}
/**
 * 当state为2并且defferreds中没有东西的时候新开一个异步任务
 * @param  {[type]} promise [description]
 * @return {[type]}      [description]
 */
function finale(promise) {
  //rejected
  if (promise.state === 2 && promise.list.length === 0) {
    setTimeout(function() {
      if (!promise.flag) {
        console.warn('no handle')
      }
    },0);
  }

  /**
   * promise.list.forEach(function(map){
   *     handle(promise,map)
   * })
   */
  for (var i = 0, len = promise.list.length; i < len; i++) {
    handle(promise, promise.list[i]);
  }
  promise.list = null;
}
/**
 * var map = new Handler(onFulfilled, onRejected, prom)
 * 则
 * map = {
 *   onFulfilled: onFulfilled 或 null
 *   onRejected: onRejected 或 null
 *   promise: prom
 * }
 */
function Handler(onFulfilled, onRejected, promise) {
  this.onFulfilled = typeof onFulfilled === 'function'
    ? onFulfilled
    : null;
  this.onRejected = typeof onRejected === 'function'
    ? onRejected
    : null;
  this.promise = promise;
}

Promise.prototype['catch'] = function(onRejected) {
  return this.then(null, onRejected);
};

Promise.prototype.then = function(onFulfilled, onRejected) {
  var prom = new this.constructor(noop);
  /**
   * prom = {
   *     state: 0,
   *     value: undefined,
   *     flag = false,
   *     list = []//list的作用就是为了当在一个promise中
   * }
   */
  handle(this, new Handler(onFulfilled, onRejected, prom));
  return prom;
};

Promise.prototype['finally'] = function(callback) {
  var constructor = this.constructor;
  return this.then(function(value) {
    return constructor.resolve(callback()).then(function() {
      return value;
    });
  }, function(reason) {
    return constructor.resolve(callback()).then(function() {
      return constructor.reject(reason);
    });
  });
};

Promise.all = function(arr) {
  return new Promise(function(resolve, reject) {
    if (!arr || typeof arr.length === 'undefined')
      throw new TypeError('Promise.all accepts an array');
    var args = Array.prototype.slice.call(arr);
    if (args.length === 0)
      return resolve([]);
    var remaining = args.length;

    function res(i, val) {
      try {
        if (val && (typeof val === 'object' || typeof val === 'function')) {
          var then = val.then;
          if (typeof then === 'function') {
            then.call(val, function(val) {
              res(i, val);
            }, reject);
            return;
          }
        }
        args[i] = val;
        if (--remaining === 0) {
          resolve(args);
        }
      } catch (ex) {
        reject(ex);
      }
    }

    for (var i = 0; i < args.length; i++) {
      res(i, args[i]);
    }
  });
};

Promise.resolve = function(value) {
  if (value && typeof value === 'object' && value.constructor === Promise) {
    return value;
  }

  return new Promise(function(resolve) {
    resolve(value);
  });
};

Promise.reject = function(value) {
  return new Promise(function(resolve, reject) {
    reject(value);
  });
};

Promise.race = function(values) {
  return new Promise(function(resolve, reject) {
    for (var i = 0, len = values.length; i < len; i++) {
      values[i].then(resolve, reject);
    }
  });
};
