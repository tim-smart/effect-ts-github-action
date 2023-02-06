import * as Path from "path"

const make = () =>
  Do($ => {
    const fs = $(NodeFs.access)

    const copyDir = (path: string, dest: string) =>
      Do($ => {
        const entries = $(fs.readdir(path, { withFileTypes: true }))
        const files = entries.filter(_ => !_.isDirectory()).map(_ => _.name)
        const effects = files.map(_ =>
          fs.copyFile(Path.join(path, _), Path.join(dest, _)),
        )
        $(Effect.collectAllParDiscard(effects))
      })

    const copyFileOrDir = (path: string, dest: string) =>
      Do($ => {
        const pathStat = $(fs.stat(path))

        $(
          pathStat.isDirectory()
            ? copyDir(path, dest)
            : fs.copyFile(path, Path.join(dest, Path.basename(path))),
        )
      })

    return {
      copyDir,
      copyFileOrDir,
    }
  })

export interface Fs extends ReturnType<typeof make> {}
export const Fs = Tag<Fs>()
export const FsLive = LiveNodeFs >> Layer.sync(Fs, make)
