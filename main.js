class CommentixPlugin {
	constructor (API, name, config) {
		this.API = API;
		this.name = name;
		this.config = config;
	}

	addInsertions () {
		this.API.addInsertion('customCommentsCode', this.addEntryScripts, 1, this);
	}

	escapeAttribute (value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	escapeText (value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	getSiteId () {
		const siteId = String(this.config.siteId || '').trim();

		return /^[A-Za-z0-9_-]{3,200}$/.test(siteId) ? siteId : '';
	}

	getPageData (rendererInstance, context) {
		let url = '';
		let thread = '';
		const relativeUrls = Boolean(
			rendererInstance.siteConfig &&
			rendererInstance.siteConfig.deployment &&
			rendererInstance.siteConfig.deployment.relativeUrls
		);

		if (rendererInstance.globalContext && rendererInstance.globalContext.website) {
			url = rendererInstance.globalContext.website.pageUrl || '';
		}

		if (context && context.post && context.post.id !== undefined && context.post.id !== null) {
			thread = `post-${context.post.id}`;
		} else if (context && context.page && context.page.id !== undefined && context.page.id !== null) {
			thread = `page-${context.page.id}`;
		} else {
			try {
				thread = new URL(url).pathname || url;
			} catch (error) {
				thread = url;
			}
		}

		return {
			relativeUrls,
			thread: String(thread || ''),
			url: String(url || '')
		};
	}

	getLanguage () {
		const language = String(this.config.language || '').trim();
		const supported = [
			'cz', 'da', 'de', 'el', 'en', 'es', 'es-419', 'fi', 'fr', 'hu', 'it',
			'nl', 'no', 'pl', 'pt', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk'
		];

		return supported.includes(language) ? language : '';
	}

	getPositiveInteger (value, fallback, minimum, maximum) {
		const parsed = Number.parseInt(String(value ?? ''), 10);

		if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
			return fallback;
		}

		return parsed;
	}

	getBrandColor () {
		const color = String(this.config.brandColor || '').trim();

		return /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color) ? color : '';
	}

	getCookieGroup () {
		const group = String(this.config.cookieBannerGroup || '').trim();

		return /^[A-Za-z0-9_-]+$/.test(group) ? group : '';
	}

	getAbsolutePageUrl (value) {
		const url = String(value || '').trim();

		try {
			const parsed = new URL(url);

			return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : '';
		} catch (error) {
			return '';
		}
	}

	getCommentsElement (siteId, page) {
		const language = this.getLanguage();
		const sort = ['best', 'latest', 'oldest'].includes(this.config.sort)
			? this.config.sort
			: 'best';
		const maxLevels = this.getPositiveInteger(this.config.maxLevels, 3, 1, 20);
		const visibleComments = this.getPositiveInteger(this.config.visibleComments, 5, 1, 100);
		const visibleLevels = this.getPositiveInteger(this.config.visibleLevels, 1, 1, 20);
		const brandColor = this.getBrandColor();
		const baseSize = this.getPositiveInteger(this.config.baseSize, 16, 10, 32);
		const attributes = [
			`site="${this.escapeAttribute(siteId)}"`,
			`sort="${sort}"`,
			`maxLevels="${maxLevels}"`,
			`visibleComments="${visibleComments}"`,
			`visibleLevels="${visibleLevels}"`
		];
		const styles = [`--commentix-base-size: ${baseSize}px`];

		if (page.thread) {
			attributes.push(`thread="${this.escapeAttribute(page.thread)}"`);
		}

		const absolutePageUrl = page.relativeUrls ? '' : this.getAbsolutePageUrl(page.url);

		if (absolutePageUrl) {
			attributes.push(`page="${this.escapeAttribute(absolutePageUrl)}"`);
		}

		if (language) {
			attributes.push(`language="${language}"`);
		}

		if (this.config.showCount === false) {
			attributes.push('noCount');
		}

		if (this.config.enableRating === false) {
			attributes.push('noRating');
		}

		if (brandColor) {
			styles.push(`--commentix-color-brand: ${brandColor}`);
		}

		attributes.push(`style="${styles.join('; ')}"`);

		return `<commentix-widget ${attributes.join(' ')}></commentix-widget>`;
	}

	getLoaderScript (cookieGroup) {
		const lazyload = Boolean(this.config.lazyload);
		const loader = `
			(function () {
				var target = document.querySelector('commentix-widget');
				var loadCommentix = function () {
					if (window.customElements && window.customElements.get('commentix-widget')) {
						return;
					}

					if (document.querySelector('script[data-commentix-comments-loader]')) {
						return;
					}

					var script = document.createElement('script');
					script.defer = true;
					script.src = 'https://static.commentix.com/js/widget.js';
					script.setAttribute('data-commentix-comments-loader', '');
					(document.head || document.body).appendChild(script);
				};

				if (${lazyload} && target && 'IntersectionObserver' in window) {
					var observer = new IntersectionObserver(function (entries) {
						for (var i = 0; i < entries.length; i++) {
							if (entries[i].isIntersecting) {
								observer.disconnect();
								loadCommentix();
								break;
							}
						}
					}, { rootMargin: '200px 0px' });

					observer.observe(target);
				} else {
					loadCommentix();
				}
			}());
		`;
		const type = cookieGroup ? ` type="gdpr-blocker/${cookieGroup}"` : '';

		return `<script${type}>${loader}</script>`;
	}

	getConsentMarkup (cookieGroup) {
		if (!cookieGroup) {
			return { notice: '', script: '' };
		}

		const notice = `
			<div
				data-gdpr-group="gdpr-blocker/${cookieGroup}"
				data-commentix-consent-notice="${cookieGroup}"
				style="color: #666; display: block; margin-top: 10px; padding: 10px 0; width: 100%;">
				${this.escapeText(this.config.cookieBannerNoConsentText)}
			</div>
		`;
		const script = `
			<script>
				document.body.addEventListener('publii-cookie-banner-unblock-${cookieGroup}', function () {
					var notices = document.querySelectorAll('[data-commentix-consent-notice="${cookieGroup}"]');

					for (var i = 0; i < notices.length; i++) {
						notices[i].style.display = 'none';
					}
				}, false);
			</script>
		`;

		return { notice, script };
	}

	getPreviewNotice (message) {
		return `<div role="status" data-comments-preview-notice="commentix" style="color: #666; display: block; padding: 10px 0; width: 100%;">${this.escapeText(message)}</div>`;
	}

	addEntryScripts (rendererInstance, context) {
		const siteId = this.getSiteId();
		const page = this.getPageData(rendererInstance, context);
		const previewMode = Boolean(rendererInstance.previewMode);
		const cookieGroup = this.config.cookieBannerIntegration ? this.getCookieGroup() : '';
		const hasInvalidCookieConfiguration = this.config.cookieBannerIntegration && !cookieGroup;
		const shouldLoad = !previewMode && siteId && !hasInvalidCookieConfiguration;
		const headingLevel = /^[2-6]$/.test(String(this.config.headingLevel)) ? this.config.headingLevel : '2';
		const cssHeaderClass = this.config.cssHeaderClass ? ` class="${this.escapeAttribute(this.config.cssHeaderClass)}"` : '';
		const cssWrapperClass = this.config.cssWrapperClass ? ` class="${this.escapeAttribute(this.config.cssWrapperClass)}"` : '';
		const cssInnerWrapperClass = this.config.cssInnerWrapperClass ? ` class="${this.escapeAttribute(this.config.cssInnerWrapperClass)}"` : '';
		const consent = !previewMode && siteId && !hasInvalidCookieConfiguration
			? this.getConsentMarkup(cookieGroup)
			: { notice: '', script: '' };
		let heading = '';
		let statusNotice = '';
		let comments = '';
		let loader = '';

		if (this.config.textHeader) {
			heading = `<h${headingLevel}${cssHeaderClass}>${this.escapeText(this.config.textHeader)}</h${headingLevel}>`;
		}

		if (previewMode && !siteId) {
			statusNotice = this.getPreviewNotice('Commentix comments cannot be previewed because the Site ID is missing or invalid. Add it in the plugin settings.');
		} else if (previewMode && hasInvalidCookieConfiguration) {
			statusNotice = this.getPreviewNotice('Commentix comments cannot be previewed because the Cookie Group ID is missing or invalid. Check the plugin settings.');
		} else if (previewMode) {
			statusNotice = this.getPreviewNotice('Commentix comments are not loaded in Publii preview. Publish your site to a test URL to verify the integration.');
		} else if (!siteId) {
			statusNotice = '<!-- Commentix Comments: A valid Site ID is required. -->';
		} else if (hasInvalidCookieConfiguration) {
			statusNotice = '<!-- Commentix Comments: Cookie Banner integration requires a valid Cookie Group ID. -->';
		}

		if (!previewMode && siteId && !hasInvalidCookieConfiguration) {
			comments = this.getCommentsElement(siteId, page);
		}

		if (shouldLoad) {
			loader = this.getLoaderScript(cookieGroup);
		}

		return `
			<div${cssWrapperClass}>
				<div${cssInnerWrapperClass}>
					${heading}
					${statusNotice}
					${comments}
					<noscript>${this.escapeText(this.config.textFallback)}</noscript>
					${consent.notice}
				</div>
			</div>
			${loader}
			${consent.script}
		`;
	}
}

module.exports = CommentixPlugin;
