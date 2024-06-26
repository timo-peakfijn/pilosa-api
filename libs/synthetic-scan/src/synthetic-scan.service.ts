import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'playwright';
import { chromium } from 'playwright';
import { co2, hosting } from '@tgwf/co2';
import { calculateTotalSize } from './utils/calculateTotalSize';
import { getTopDomain } from './utils/getTopDomain';
import { formatBytes } from './utils/formatBytes';
import { isCdn } from './utils/isCdn';
import { isCompressed } from './utils/isCompressed';
import { isCacheable } from './utils/isCacheable';
import { findRequestByContentType } from './utils/findRequestByContentType';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export type NetworkRequest = {
  url: string;
  request: Request;
  response?: Response;
};

export type FileTypeResult = {
  count: number;
  totalBytes: number;
  totalBytesFormatted: string;
  estimatedCo2: number;
};

type Hosting = {
  domain: string;
  green: boolean;
};

export type DomainResult = {
  domain: string | null;
  requests: NetworkRequest[];
  hosting: Hosting[];
  time?: {
    domReady: number;
    load: number;
    networkIdle: number;
  };
  totalBytes: number;
  totalBytesFormatted: string;
  estimatedCo2: number;
  cdnPercentage: number;
  compressedPercentage: number;
  cachePercentage: number;
  fileTypes: {
    images?: FileTypeResult;
    scripts?: FileTypeResult;
    stylesheets?: FileTypeResult;
    json?: FileTypeResult;
    fonts?: FileTypeResult;
    video?: FileTypeResult;
    audio?: FileTypeResult;
    other?: FileTypeResult;
  };
};

export type VisitResult = {
  total?: DomainResult;
  domains?: DomainResult[];
};

export type Result = {
  firstVisit?: VisitResult;
  secondVisit?: VisitResult;
};

const ignoreDomains = ['localhost'];

const logger = console.log;

const scrollPageToEnd = async (page) => {
  const scrollStep = 250; // Scroll down by 250 pixels

  while (true) {
    await page.evaluate((scrollStep) => {
      window.scrollBy(0, scrollStep);
    }, scrollStep);

    await page.waitForTimeout(50);

    const totalScroll = await page.evaluate(() => {
      return Math.ceil(document.body.scrollHeight - window.innerHeight);
    });

    const currentScroll = await page.evaluate(() => {
      return Math.ceil(window.scrollY);
    });

    if (currentScroll >= totalScroll) {
      break;
    }
  }
};

const co2Emission = new co2({});

async function toFileTypeResult(
  networkRequests: NetworkRequest[],
  greenHost: boolean,
): Promise<FileTypeResult> {
  const totalBytes = await calculateTotalSize(networkRequests);

  return {
    count: networkRequests.length,
    totalBytes,
    totalBytesFormatted: formatBytes(totalBytes),
    estimatedCo2: co2Emission.perByte(totalBytes, greenHost),
  };
}

@Injectable()
export class SyntheticScanService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async run(url: string): Promise<VisitResult> {
    const cachedResult = await this.cacheManager.get<VisitResult>(url);

    if (cachedResult) {
      console.log('from cache', url);
      return cachedResult;
    }

    const browser = await chromium.launch({
      // headless: false,
    });
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });

    let domReadyTime: number;
    let loadTime: number;

    let networkRequests: NetworkRequest[] = [];

    async function handleRequest(request: Request) {
      networkRequests.push({
        url: request.url(),
        request,
        response: await request.response(),
      });
    }

    const handleDomContentLoaded = () => {
      domReadyTime = (Date.now() - startTime) / 1000;
    };

    const handleLoad = () => {
      loadTime = (Date.now() - startTime) / 1000;
    };

    page.on('requestfinished', handleRequest);
    page.on('domcontentloaded', handleDomContentLoaded);
    page.on('load', handleLoad);

    const startTime = Date.now();

    logger(`Visiting ${url}`);

    await page.goto(url);

    await page.waitForLoadState('load');

    // Call the function to scroll down the page smoothly until the end

    const networkIdleTime = (Date.now() - startTime) / 1000;

    await scrollPageToEnd(page);

    // console.log('A', networkRequests.length);
    // unique network requests (based on url)
    networkRequests = Array.from(
      new Map(
        networkRequests.map((request) => [request.url, request]),
      ).values(),
    );

    const domainRequests = Array.from(
      new Set(
        networkRequests
          .map((request) => new URL(request.url).hostname)
          .filter((hostname) => !ignoreDomains.includes(hostname)),
      ),
    );

    const pageTitle = await page.title();

    // const domainsWithGreenCheck = await Promise.all(domainRequests.map(async (domain) => {
    //   const cacheKey = `green-hosting-${domain}`;
    //   let green = await this.cacheManager.get<boolean>(cacheKey);
    //
    //   console.log({domain , fromCache: green})
    //
    //   if(green === null || green === undefined) {
    //      const green = await hosting.check(domain) as boolean
    //
    //     // await this.cacheManager.set(cacheKey, green, 60 * 60);
    //   }
    //   console.log({domain,green})
    //
    //   return {
    //     domain,
    //     green,
    //   };
    // }));
    //
    // console.log(domainsWithGreenCheck);

    // const greenHostingResult = await hosting.check(domainRequests);

    const totalBytes = await calculateTotalSize(networkRequests);
    const mainTopDomain = getTopDomain(url);
    //
    // const mainDomainWithGreenCheck = domainsWithGreenCheck.find(({ domain }: any) => domain === mainTopDomain);
    // const green = mainDomainWithGreenCheck.green;

    console.log(mainTopDomain);

    const green = (await hosting.check(mainTopDomain)) as boolean;

    logger(`Calculating total results`);

    const result: any = {
      total: {
        domain: null,
        pageTitle,
        hosting: [
          {
            domain: mainTopDomain,
            green,
          },
        ],
        // requests: networkRequests,
        // requests: [],
        numberOfRequests: networkRequests.length,
        time: {
          domReady: domReadyTime,
          load: loadTime,
          networkIdle: networkIdleTime,
        },
        totalBytes: totalBytes,
        totalBytesFormatted: formatBytes(totalBytes),
        estimatedCo2: co2Emission.perVisit(totalBytes, green),
        cdnPercentage:
          (networkRequests.filter(isCdn).length / networkRequests.length) * 100,
        compressedPercentage:
          (networkRequests.filter(isCompressed).length /
            networkRequests.length) *
          100,
        cachePercentage:
          (networkRequests.filter(isCacheable).length /
            networkRequests.length) *
          100,
        fileTypes: {
          images: await toFileTypeResult(
            networkRequests.filter(findRequestByContentType('image/')),
            green,
          ),
          scripts: await toFileTypeResult(
            networkRequests.filter(findRequestByContentType('javascript')),
            green,
          ),
          stylesheets: await toFileTypeResult(
            networkRequests.filter(findRequestByContentType('text/css')),
            green,
          ),
          json: await toFileTypeResult(
            networkRequests.filter(findRequestByContentType('json')),
            green,
          ),
          fonts: await toFileTypeResult(
            networkRequests.filter(findRequestByContentType('font')),
            green,
          ),
          video: await toFileTypeResult(
            networkRequests.filter(findRequestByContentType('video')),
            green,
          ),
          audio: await toFileTypeResult(
            networkRequests.filter(findRequestByContentType('audio')),
            green,
          ),
        },
      },
      domains: domainRequests,
    };

    void browser.close();

    await this.cacheManager.set(url, result, 60 * 60 * 10);

    return result;
  }
}
