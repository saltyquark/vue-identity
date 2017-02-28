import {
  error,
  parseToken
} from './util'

const identity = {
  defaults: {
    url: '/api',
    loginUrl: '/login',
    logoutUrl: '/logout',
    refreshUrl: '/refresh',
    accessToken: 'token',
    refreshToken: 'refresh',
    unauthorizedRedirect: null,
    redirect: null,
    scope: null
  },
  install(Vue, opts) {
    if (identity.installed) {
      return
    }
    // setup
    var vm = new Vue({
      data: {
        refreshToken: window.localStorage['vue-identity:refreshToken'],
        accessToken: null,
        expires: null,
        user: null,
        notBefore: null,
        issuedAt: null,
        loading: false,
        checking: false,
        expiryTimer: null
      },
      computed: {
        expiresIn() {
          return this.expires ? (this.expires * 1000) - Date.now() : false
        }
      }
    })

    let self = Vue.prototype.$identity = vm
    let options = Object.assign(identity.defaults, opts)

    let http = Vue.http
    let router = opts.router

    if (!http) {
      console.error('VueIdentity requires vue-resource. Make sure you Vue.use(VueResource) before Vue.use(VueIdentity)')
    }
    Vue.http.interceptors.push(function(request, next) {
      request.headers.set('Authorization', 'Bearer ' + self.accessToken)
      next()
    })
    if (!router) {
      console.info('To use with vue-router, pass it to me Vue.use(VueIdentity, {router})')
    } else {
      router.beforeEach((to, from, next) => {
        var $identity = options.router.app.$identity
        if (to.meta.identity && $identity.user === null) {
          $identity.authenticate().then(function() {
            next()
          }, function() {
            if (options.unauthorizedRedirect)
              next({
                path: options.unauthorizedRedirect
              })
          })
        } else {
          next()
        }
      })
    }

    // bind events
    window.onfocus = function() {
      self.attemptRefresh()
    }

    // methods
    self.uri = function(endpoint) {
      return options.url + options[endpoint + 'Url']
    }
    self.authenticate = function() {
      if (self.refreshToken) return Promise.resolve()
      var params = {}
      if (options.scope) params.scope = options.scope
      if (options.redirect) params.redirect = options.redirect
      return self.attachRequestQuarterback(http.get(this.uri('login'), {
        credentials: true,
        params: params
      }))
    }
    self.refresh = function() {
      return self.attachRequestQuarterback(http.post(this.uri('refresh'), {
        token: self.refreshToken
      }))
    }
    self.login = function(data) {
      return self.attachRequestQuarterback(http.post(this.uri('login'), data, {
        credentials: true,
        params: params
      }))
    }
    self.logout = function() {
      self.refreshToken = null
      self.accessToken = null
      self.user = null
      self.expires = null
      self.issuedAt = null
      self.notBefore = null
      return Promise.resolve()
    }
    self.attachRequestQuarterback = function(promise) {
      self.loading = true
      return promise.then(function(r) {
        self.receivethMightyToken(r.data)
        return Promise.resolve()
      }).catch(function(e) {
        if (e.headers.get('X-Authentication-Location'))
          window.location.href = e.headers.get('X-Authentication-Location')
        return error(e)
      }).finally(function() {
        self.loading = false
      })
    }
    self.receivethMightyToken = function(tokenIsMightier) {
      var accessToken = tokenIsMightier[options.accessToken]
      var refreshToken = tokenIsMightier[options.refreshToken]
      if (accessToken == undefined) return error('No token received')
      var user = parseToken(accessToken)
      self.accessToken = accessToken
      self.refreshToken = refreshToken
      self.user = user
      self.expires = user.exp
      self.issuedAt = user.iat
      self.notBefore = user.nbf
      self.attemptRefreshIn(self.expiresIn - 30000)
    }
    self.attemptRefreshIn = function(ms) {
      clearTimeout(self.expiryTimer)
      self.expiryTimer = setTimeout(function() {
        self.attemptRefresh()
      }, ms)
    }
    self.attemptRefresh = function() {
      var expiresIn = (self.expires * 1000) - Date.now()

      if (self.tokenValid() && expiresIn <= 300000) {
        self.authenticate().catch(function() {
          clearInterval(self.expiryTimer)
        })
      }
    }
    self.isLoggedIn = function() {
      return self.tokenValid()
    }
    self.tokenValid = function() {
      return self.refreshToken && ((self.expires * 1000) - Date.now()) > 0
    }
  }
}
export default identity
