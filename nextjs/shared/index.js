import React from 'react';
import createMatcher from 'feather-route-matcher';
const remoteVars = process.env.REMOTES || {};
const remotes = Object.entries(remoteVars).reduce((acc, item) => {
  const [key, value] = item;
  const [global, url] = value.split('@');
  acc[key] = {
    url,
    global,
  };
  return acc;
}, {});

const injectScript = async key => {
  var __webpack_error__ = new Error();
  const remoteGlobal = remotes[key].global;
  return new Promise(function (resolve, reject) {
    if (typeof window[remoteGlobal] !== 'undefined') return resolve();
    __webpack_require__.l(
      remotes[key].url,
      function (event) {
        if (typeof window[remoteGlobal] !== 'undefined') return resolve();
        var errorType = event && (event.type === 'load' ? 'missing' : event.type);
        var realSrc = event && event.target && event.target.src;
        __webpack_error__.message = 'Loading script failed.\n(' + errorType + ': ' + realSrc + ')';
        __webpack_error__.name = 'ScriptExternalLoadError';
        __webpack_error__.type = errorType;
        __webpack_error__.request = realSrc;
        reject(__webpack_error__);
      },
      'glo' + remoteGlobal,
    );
  }).then(() => {
    return new Promise(function (res, rej) {
      try {
        res(window[remoteGlobal].init(__webpack_share_scopes__.default));
      } catch (e) {
        console.log(e);
        res();
      }
    }).then(function () {
      console.log('resolving', remoteGlobal);
      return window[remoteGlobal];
    });
  });
};

export async function matchFederatedPage(path) {
  const maps = await Promise.all(
    Object.keys(remotes).map(async remote => {
      const foundContainer = injectScript(remote);
      const container = await foundContainer;

      return container
        .get('./pages-map')
        .then(factory => ({ remote, config: factory().default }))
        .catch(() => null);
    }),
  );

  const config = {};

  for (let map of maps) {
    if (!map) continue;

    for (let [path, mod] of Object.entries(map.config)) {
      config[path] = {
        remote: map.remote,
        module: mod,
      };
    }
  }

  console.log(config);

  const matcher = createMatcher(config);
  const match = matcher(path);

  return match;
}

export function createFederatedCatchAll() {
  const FederatedCatchAll = initialProps => {
    const [lazyProps, setProps] = React.useState({});

    const { FederatedPage, render404, renderError, needsReload, ...props } = {
      ...lazyProps,
      ...initialProps,
    };
    React.useEffect(() => {
      if (needsReload) {
        const runUnderlayingGIP = async () => {
          const federatedProps = await FederatedCatchAll.getInitialProps(props);
          setProps(federatedProps);
        };
        runUnderlayingGIP();
      }
    }, []);

    if (render404) {
      // TODO: Render 404 page
      return React.createElement('h1', {}, '404 Not Found');
    }
    if (renderError) {
      // TODO: Render error page
      return React.createElement('h1', {}, 'Oops, something went wrong.');
    }

    if (FederatedPage) {
      return React.createElement(FederatedPage, props);
    }

    return null;
  };

  FederatedCatchAll.getInitialProps = async ctx => {
    const { err, req, res, AppTree, ...props } = ctx;
    if (err) {
      // TODO: Run getInitialProps for error page
      return { renderError: true, ...props };
    }
    if (!process.browser) {
      return { needsReload: true, ...props };
    }

    console.log('in browser');
    const matchedPage = await matchFederatedPage(ctx.asPath);

    try {
      console.log('matchedPage', matchedPage);
      const remote = matchedPage?.value?.remote;
      const mod = matchedPage?.value?.module;

      if (!remote || !mod) {
        // TODO: Run getInitialProps for 404 page
        return { render404: true, ...props };
      }

      console.log('loading exposed module', mod, 'from remote', remote);
      const container = await injectScript(remote);
      const FederatedPage = await container.get(mod).then(factory => factory().default);
      console.log('FederatedPage', FederatedPage);
      if (!FederatedPage) {
        // TODO: Run getInitialProps for 404 page
        return { render404: true, ...props };
      }

      const modifiedContext = {
        ...ctx,
        query: matchedPage.params,
      };
      const federatedPageProps = (await FederatedPage.getInitialProps?.(modifiedContext)) || {};
      return { ...federatedPageProps, FederatedPage };
    } catch (err) {
      console.log('err', err);
      // TODO: Run getInitialProps for error page
      return { renderError: true, ...props };
    }
  };

  return FederatedCatchAll;
}
