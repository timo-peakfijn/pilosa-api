import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Options,
  Post,
  Req,
  Header,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';

import { CreateBrowserMetricDto } from './dto/create-browser-metric.dto';
import { FrontendAppService } from './frontend-app.service';
import { BrowserMetricService } from './browser-metric.service';
import { Project } from '@app/project/entities/project.entity';
import { Public } from '@app/auth/decorators/public.decorator';
import { ClientIp } from '@app/web-metrics/decorators/client-ip.decorator';

const FRONTEND_APP_ID = 'x-id';

// TODO this is duplicated
type FirstPageLoad = boolean;
type Timestamp = number;
type InitiatorType = string;
type Domain = string;
type Path = string;
type Origin = string;
type NumberOfBytes = number;
type FileExtension = string;
type CompressedBytes = NumberOfBytes;
type UncompressedBytes = NumberOfBytes;

type CombinedPayload = {
  f: FirstPageLoad;
  t: Timestamp;
  b: [CompressedBytes, UncompressedBytes];
  d: {
    [key: Domain]: {
      [key: Path]: {
        [key: InitiatorType]: {
          [key: FileExtension]: {
            b: [CompressedBytes, UncompressedBytes];
            co: Origin[];
          };
        };
      };
    };
  };
};

@Controller('beacon')
export class BeaconController {
  constructor(
    private frontendAppService: FrontendAppService,
    private browserMetricService: BrowserMetricService,
  ) {}

  @Options()
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Access-Control-Allow-Methods', 'POST')
  @Header(
    'Access-Control-Allow-Headers',
    [FRONTEND_APP_ID, 'Content-Type'].join(','),
  )
  async options() {
    return null;
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Access-Control-Allow-Methods', 'POST')
  @Header(
    'Access-Control-Allow-Headers',
    [FRONTEND_APP_ID, 'Content-Type'].join(','),
  )
  async create(
    @Body() createBrowserMetricDto: CombinedPayload,
    @Req() req: Request,
    @ClientIp() clientIp: string,
  ) {
    const frontendAppId = req.headers[FRONTEND_APP_ID] as Project['id'];
    const frontendApp =
      await this.frontendAppService.findOneById(frontendAppId);

    if (!frontendApp) {
      throw new ForbiddenException(`App ${frontendAppId} not found`);
    }

    if (!req.headers['referer']) {
      throw new BadRequestException('Missing referer');
    }

    const url = new URL(req.headers['referer'] as string);

    const isAllowed =
      frontendApp.urls?.includes(url.hostname) ||
      frontendApp.urls?.includes('*');

    if (!isAllowed) {
      throw new ForbiddenException('Invalid domain');
    }

    console.log(JSON.stringify(createBrowserMetricDto, null, 2));

    Object.keys(createBrowserMetricDto.d).forEach((domain) => {
      Object.keys(createBrowserMetricDto.d[domain]).forEach((path) => {
        Object.keys(createBrowserMetricDto.d[domain][path]).forEach(
          (initiatorType) => {
            Object.keys(
              createBrowserMetricDto.d[domain][path][initiatorType],
            ).forEach(async (extension) => {
              const { b: bytes, co: crossOrigins } =
                createBrowserMetricDto.d[domain][path][initiatorType][
                  extension
                ];

              const [bytesCompressed, bytesUncompressed] = bytes;

              if (bytesCompressed > 0 || bytesUncompressed > 0) {
                const metric: CreateBrowserMetricDto = {
                  firstLoad: createBrowserMetricDto.f,
                  domain,
                  path,
                  initiatorType,
                  extension: extension === '__none__' ? null : extension,
                  bytesCompressed,
                  bytesUncompressed,
                  userAgent: req.headers['user-agent'] as string,
                  ip: clientIp,
                };

                const browserMetric = await this.browserMetricService.create(
                  metric,
                  frontendApp,
                );

                void this.browserMetricService.save(browserMetric);
              }

              if(crossOrigins.length) {
                // TODO store this in backend, so we can tell the client to add these to the CORS policy
                console.log(initiatorType, extension, crossOrigins)
              }
            });
          },
        );
      });
    });

    return null;
  }
}
