#!/usr/bin/env node

import { program } from 'commander';
import Fs from 'fs';
import Path from 'path';
import Axios from 'axios';

const httpHeader = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36 Edg/89.0.774.75'
};
async function downloadImage(url: string, path: string) {
    const writer = Fs.createWriteStream(path);
    const response = await Axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: httpHeader,
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    })
}

async function download(url: string) {
    // url
    // https://iiif.lib.harvard.edu/manifests/view/ids:2472900
    // https://iiif.lib.harvard.edu/manifests/view/drs:430576916$5i
    // manifest
    // https://iiif.lib.harvard.edu/manifests/ids:2472900
    // https://iiif.lib.harvard.edu/manifests/drs:430576916
    try {
        let manifest = "";
        let id = "";
        const ids = /(?<=ids:)\d+/.exec(url);
        if (ids && ids[0]) {
            id = ids[0];
            manifest = `https://iiif.lib.harvard.edu/manifests/ids:${ids[0]}`;
        } else {
            const drs = /(?<=drs:)\d+/.exec(url);
            if (drs && drs[0]) {
                id = drs[0];
                manifest = `https://iiif.lib.harvard.edu/manifests/drs:${drs[0]}`;
            }
        }
        if (!manifest || !Number(id)) {
            console.error('invalid manifest url:', manifest);
            return;
        }
        console.log('manifest:', manifest);
        const response = await Axios.get(manifest, {
            headers: httpHeader
        });
        if (response.status == 200 && typeof response.data === 'object') {
            console.log(response.data.label);
            const imageDir = Path.resolve(id + '-' +
                (response.data.label ? response.data.label.substr(0, 64).replace(/[\\\/:\*\?"<>\| ]/g, '-') : ''));
            if (!Fs.existsSync(imageDir)) Fs.mkdirSync(imageDir, { recursive: true });

            Fs.writeFileSync(Path.resolve(imageDir, 'manifest.json'), JSON.stringify(response.data, null, 2));
            const urls = response.data.sequences[0].canvases
                .map((value: {
                    thumbnail: { [x: string]: string; };
                    label: string;
                    width: number;
                    height: number;
                }) => {
                    const suffix = value.thumbnail["@id"].substr(value.thumbnail["@id"].lastIndexOf('.'));
                    const subId = /(?<=iiif\/)\d+/.exec(value.thumbnail["@id"]);
                    const seq = value.label.replace(/\s/g, '-');
                    return {
                        url: value.thumbnail["@id"]
                            .replace('full', `0,0,${value.width},${value.height}`)
                            .replace(',150', `${value.width},`),
                        filename: `${subId}-${seq}-${value.width}x${value.height}${suffix}`
                    }
                });
            for (let value of urls) {
                const path = Path.resolve(imageDir, value.filename);
                //console.log(value.url, ' ==> ', path);
                await downloadImage(value.url, path);
                const stat = Fs.statSync(path);
                console.log(value.filename, ' ==> ', (stat.size / 1024 / 1024).toPrecision(3), 'MB');
            }
        } else {
            console.error(response.headers);
        }
    } catch (error) {
        console.error(error);
    }
}

(async () => {
    program.version('0.0.1');
    program.description('sample: https://iiif.lib.harvard.edu/manifests/view/drs:430576916$1i');
    program
        .requiredOption('--url <url link>', '430576916')
        .action(async (opts) => {
            await download(opts.url);
        });
    await program.parseAsync(process.argv);
})();